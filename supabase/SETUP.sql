-- Salon №215 CRM — initial schema
-- Apply via Supabase SQL Editor or `supabase db push`

create sequence if not exists booking_number_seq start 1;

create table service_categories (
  id uuid primary key default gen_random_uuid(),
  name_ka text not null,
  name_ru text not null,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references service_categories(id) on delete cascade,
  name_ka text not null,
  name_ru text not null,
  price_from numeric not null,
  price_to numeric, -- null = fixed price; filled = range
  duration_minutes int not null default 30,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  constraint price_to_gte_from check (price_to is null or price_to >= price_from)
);

create table masters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table working_hours (
  id uuid primary key default gen_random_uuid(),
  master_id uuid references masters(id) on delete cascade, -- null = salon-wide default
  day_of_week int not null check (day_of_week between 0 and 6), -- 0=Sun ... 6=Sat
  open_time time,
  close_time time,
  is_day_off boolean default false
);

-- one row per weekday for the salon-wide default (master_id is null)
create unique index working_hours_default_day
  on working_hours (day_of_week) where master_id is null;
-- one row per weekday per master
create unique index working_hours_master_day
  on working_hours (master_id, day_of_week) where master_id is not null;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null, -- e.g. BK-2026-0347
  client_name text not null,
  client_surname text not null,
  client_phone text not null, -- E.164, also the WhatsApp number
  master_id uuid references masters(id),
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed'
    check (status in ('confirmed','cancelled','completed','no_show')),
  cancel_token text unique not null,
  comment text,
  source text not null default 'client' check (source in ('client','admin')),
  whatsapp_sent boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table booking_services (
  booking_id uuid references bookings(id) on delete cascade,
  service_id uuid references services(id),
  primary key (booking_id, service_id)
);

-- race-condition guard: two clients can't grab the same slot for the same master.
-- coalesce so that NULL master_id rows also collide.
create unique index unique_active_booking
  on bookings (coalesce(master_id, '00000000-0000-0000-0000-000000000000'::uuid), booking_date, start_time)
  where status = 'confirmed';

create index bookings_date_idx on bookings (booking_date);
create index bookings_phone_idx on bookings (client_phone);
create index bookings_status_idx on bookings (status);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_bookings_updated
  before update on bookings
  for each row execute function set_updated_at();

-- ============ RLS ============
alter table service_categories enable row level security;
alter table services enable row level security;
alter table masters enable row level security;
alter table working_hours enable row level security;
alter table bookings enable row level security;
alter table booking_services enable row level security;

-- public read for reference data
create policy "public read" on service_categories for select using (true);
create policy "public read" on services for select using (true);
create policy "public read" on masters for select using (true);
create policy "public read" on working_hours for select using (true);

-- writes only for authenticated admins
create policy "admin write" on service_categories for all to authenticated using (true) with check (true);
create policy "admin write" on services for all to authenticated using (true) with check (true);
create policy "admin write" on masters for all to authenticated using (true) with check (true);
create policy "admin write" on working_hours for all to authenticated using (true) with check (true);

-- bookings: anon may create (booking form); full access only for admins.
-- Token-gated reads go through security definer RPCs below.
create policy "anon insert" on bookings for insert to anon with check (true);
create policy "admin read" on bookings for select to authenticated using (true);
create policy "admin update" on bookings for update to authenticated using (true) with check (true);
create policy "admin delete" on bookings for delete to authenticated using (true);

create policy "anon insert" on booking_services for insert to anon with check (true);
create policy "admin read" on booking_services for select to authenticated using (true);
create policy "admin write" on booking_services for all to authenticated using (true) with check (true);

-- ============ RPCs ============

-- Atomic booking creation: order number via sequence, services link in same transaction.
-- Called with the service-role key from the API route (and by authenticated admins).
create or replace function create_booking(
  p_master_id uuid,
  p_date date,
  p_start time,
  p_end time,
  p_name text,
  p_surname text,
  p_phone text,
  p_comment text,
  p_service_ids uuid[],
  p_source text,
  p_cancel_token text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_order text;
begin
  v_order := 'BK-' || extract(year from p_date)::int || '-' ||
             lpad(nextval('booking_number_seq')::text, 4, '0');

  insert into bookings (
    order_number, client_name, client_surname, client_phone, master_id,
    booking_date, start_time, end_time, cancel_token, comment, source
  ) values (
    v_order, p_name, p_surname, p_phone, p_master_id,
    p_date, p_start, p_end,
    coalesce(nullif(p_cancel_token, ''), gen_random_uuid()::text),
    nullif(p_comment, ''),
    coalesce(nullif(p_source, ''), 'client')
  ) returning id into v_id;

  insert into booking_services (booking_id, service_id)
  select v_id, s from unnest(p_service_ids) as s;

  return json_build_object('id', v_id, 'order_number', v_order);
end $$;

revoke all on function create_booking from public, anon;
grant execute on function create_booking(uuid, date, time, time, text, text, text, text, uuid[], text, text)
  to authenticated, service_role;

-- Token-gated read: returns one booking with its services, or null.
create or replace function get_booking_by_token(p_token text)
returns json
language plpgsql security definer set search_path = public stable as $$
declare
  v bookings%rowtype;
  v_services json;
  v_master text;
begin
  select * into v from bookings where cancel_token = p_token;
  if not found then
    return null;
  end if;

  select json_agg(json_build_object(
    'id', s.id, 'name_ka', s.name_ka, 'name_ru', s.name_ru,
    'price_from', s.price_from, 'price_to', s.price_to,
    'duration_minutes', s.duration_minutes
  )) into v_services
  from booking_services bs
  join services s on s.id = bs.service_id
  where bs.booking_id = v.id;

  select name into v_master from masters where id = v.master_id;

  return json_build_object(
    'id', v.id,
    'order_number', v.order_number,
    'client_name', v.client_name,
    'client_surname', v.client_surname,
    'client_phone', v.client_phone,
    'master_id', v.master_id,
    'master_name', v_master,
    'booking_date', v.booking_date,
    'start_time', v.start_time,
    'end_time', v.end_time,
    'status', v.status,
    'comment', v.comment,
    'created_at', v.created_at,
    'services', coalesce(v_services, '[]'::json)
  );
end $$;

grant execute on function get_booking_by_token(text) to anon, authenticated, service_role;

-- Token-gated cancel.
create or replace function cancel_booking_by_token(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled'
  where cancel_token = p_token and status = 'confirmed';
  return get_booking_by_token(p_token);
end $$;

grant execute on function cancel_booking_by_token(text) to anon, authenticated, service_role;

-- Token-gated reschedule. Availability must be re-checked by the caller first;
-- the unique_active_booking index still blocks exact start-time collisions.
create or replace function reschedule_booking_by_token(
  p_token text, p_date date, p_start time, p_end time
) returns json
language plpgsql security definer set search_path = public as $$
begin
  update bookings
  set booking_date = p_date, start_time = p_start, end_time = p_end
  where cancel_token = p_token and status = 'confirmed';
  return get_booking_by_token(p_token);
end $$;

grant execute on function reschedule_booking_by_token(text, date, time, time)
  to anon, authenticated, service_role;
-- Placeholder seed data — replace with the real price list via the admin panel.

insert into service_categories (name_ka, name_ru, sort_order) values
  ('თმის შეჭრა', 'Стрижки', 1),
  ('თმის შეღებვა', 'Окрашивание', 2),
  ('მანიკიური', 'Маникюр', 3),
  ('პედიკიური', 'Педикюр', 4);

insert into services (category_id, name_ka, name_ru, price_from, price_to, duration_minutes, sort_order)
select c.id, v.ka, v.ru, v.pf, v.pt, v.dur, v.ord
from (values
  ('Стрижки', 'ქალის შეჭრა', 'Женская стрижка', 25.00, 30.00, 60, 1),
  ('Стрижки', 'მამაკაცის შეჭრა', 'Мужская стрижка', 20.00, null, 40, 2),
  ('Стрижки', 'ბავშვის შეჭრა', 'Детская стрижка', 15.00, null, 30, 3),
  ('Окрашивание', 'სრული შეღებვა', 'Полное окрашивание', 60.00, 90.00, 120, 1),
  ('Окрашивание', 'ფესვების შეღებვა', 'Окрашивание корней', 45.00, null, 90, 2),
  ('Маникюр', 'მანიკიური', 'Маникюр', 25.00, null, 60, 1),
  ('Маникюр', 'გელ-ლაქი', 'Гель-лак', 35.00, 40.00, 90, 2),
  ('Педикюр', 'პედიკიური', 'Педикюр', 35.00, null, 60, 1)
) as v(cat, ka, ru, pf, pt, dur, ord)
join service_categories c on c.name_ru = v.cat;

insert into masters (name) values ('Nino');

-- Salon-wide default hours (master_id = null): Mon–Sat 10:00–20:00, Sunday off.
insert into working_hours (master_id, day_of_week, open_time, close_time, is_day_off) values
  (null, 0, null, null, true),
  (null, 1, '10:00', '20:00', false),
  (null, 2, '10:00', '20:00', false),
  (null, 3, '10:00', '20:00', false),
  (null, 4, '10:00', '20:00', false),
  (null, 5, '10:00', '20:00', false),
  (null, 6, '10:00', '20:00', false);
