-- Add English names for full 3-language i18n (ka/ru/en).
-- Idempotent — safe to run multiple times.

alter table service_categories add column if not exists name_en text;
alter table services add column if not exists name_en text;

-- Include name_en in the token-gated booking read so the client manage page
-- shows service names in the visitor's language.
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
    'id', s.id, 'name_ka', s.name_ka, 'name_ru', s.name_ru, 'name_en', s.name_en,
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
