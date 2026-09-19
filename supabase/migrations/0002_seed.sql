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
