-- Multi-service visits: each service becomes its own booking row ("leg"),
-- linked by group_id and sharing one order number. The manage link is the
-- group_id, so one URL manages the whole visit.
-- Idempotent — safe to run multiple times.

alter table bookings add column if not exists group_id uuid;

-- legs of one visit intentionally share the order number
alter table bookings drop constraint if exists bookings_order_number_key;

create index if not exists bookings_group_idx on bookings (group_id);

-- Atomic multi-leg booking: one order number, one group, each leg gets its
-- own row + cancel_token. All-or-nothing — a conflict on any leg rolls back.
create or replace function create_booking_group(
  p_name text,
  p_surname text,
  p_phone text,
  p_comment text,
  p_source text,
  p_legs jsonb -- [{master_id, date, start, end, service_ids: [uuid,...]}]
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := gen_random_uuid();
  v_order text;
  v_first_date date;
  v_leg jsonb;
  v_id uuid;
  v_token text;
  v_legs jsonb := '[]'::jsonb;
begin
  select min((l->>'date')::date) into v_first_date
  from jsonb_array_elements(p_legs) as l;

  v_order := 'BK-' || extract(year from v_first_date)::int || '-' ||
             lpad(nextval('booking_number_seq')::text, 4, '0');

  for v_leg in select * from jsonb_array_elements(p_legs) loop
    v_token := gen_random_uuid()::text;

    insert into bookings (
      order_number, group_id, client_name, client_surname, client_phone,
      master_id, booking_date, start_time, end_time, cancel_token, comment, source
    ) values (
      v_order, v_group, p_name, p_surname, p_phone,
      nullif(v_leg->>'master_id', '')::uuid,
      (v_leg->>'date')::date, (v_leg->>'start')::time, (v_leg->>'end')::time,
      v_token, nullif(p_comment, ''),
      coalesce(nullif(p_source, ''), 'client')
    ) returning id into v_id;

    insert into booking_services (booking_id, service_id)
    select v_id, x::uuid
    from jsonb_array_elements_text(v_leg->'service_ids') as x;

    v_legs := v_legs || jsonb_build_object('id', v_id, 'cancel_token', v_token);
  end loop;

  return json_build_object(
    'order_number', v_order,
    'group_id', v_group,
    'legs', v_legs::json
  );
end $$;

revoke all on function create_booking_group from public, anon;
grant execute on function create_booking_group(text, text, text, text, text, jsonb)
  to authenticated, service_role;

-- Visit read by token: accepts either a leg's cancel_token or the group_id.
-- Returns the shared header plus every leg with its services — the manage
-- page renders one card per leg.
create or replace function get_visit_by_token(p_token text)
returns json
language plpgsql security definer set search_path = public stable as $$
declare
  v_group uuid;
  v_head bookings%rowtype;
  v_legs json;
begin
  select group_id into v_group from bookings where cancel_token = p_token;

  if not found then
    begin
      v_group := p_token::uuid;
    exception when others then
      return null;
    end;
    if not exists (select 1 from bookings where group_id = v_group) then
      return null;
    end if;
  end if;

  select * into v_head from bookings
  where (v_group is not null and group_id = v_group)
     or (v_group is null and cancel_token = p_token)
  order by booking_date, start_time
  limit 1;

  if not found then
    return null;
  end if;

  select json_agg(leg order by leg->>'booking_date', leg->>'start_time')
  into v_legs
  from (
    select json_build_object(
      'id', b.id,
      'cancel_token', b.cancel_token,
      'master_id', b.master_id,
      'master_name', (select name from masters where id = b.master_id),
      'booking_date', b.booking_date,
      'start_time', b.start_time,
      'end_time', b.end_time,
      'status', b.status,
      'services', coalesce((
        select json_agg(json_build_object(
          'id', s.id, 'name_ka', s.name_ka, 'name_ru', s.name_ru, 'name_en', s.name_en,
          'price_from', s.price_from, 'price_to', s.price_to,
          'duration_minutes', s.duration_minutes
        ))
        from booking_services bs
        join services s on s.id = bs.service_id
        where bs.booking_id = b.id
      ), '[]'::json)
    ) as leg
    from bookings b
    where (v_group is not null and b.group_id = v_group)
       or (v_group is null and b.cancel_token = p_token)
  ) t;

  return json_build_object(
    'order_number', v_head.order_number,
    'client_name', v_head.client_name,
    'client_surname', v_head.client_surname,
    'client_phone', v_head.client_phone,
    'comment', v_head.comment,
    'created_at', v_head.created_at,
    'legs', coalesce(v_legs, '[]'::json)
  );
end $$;

grant execute on function get_visit_by_token(text) to anon, authenticated, service_role;
