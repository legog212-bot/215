# Salon №215 — CRM + сайт онлайн-записи

Next.js 15 (App Router) + TypeScript + Supabase + next-intl (ka/ru/en) + Tailwind + shadcn/ui + WhatsApp Cloud API.

## Запуск

```bash
npm install
cp .env.example .env.local   # заполнить ключами Supabase
npm run dev
```

- Клиентский сайт: `http://localhost:3000/ka` (или `/ru`, `/en`)
- Админка: `http://localhost:3000/admin`

## Настройка Supabase

1. Создать проект на supabase.com.
2. Применить миграции: SQL Editor → выполнить `supabase/migrations/0001_init.sql`, затем `0002_seed.sql` (сиды-заглушки, потом заменить реальным прайсом через админку).
   Либо `supabase link && supabase db push`.
3. В Authentication → Users создать пользователя-менеджера (email + пароль) — это логин админки.
4. Ключи из Settings → API прописать в `.env.local`.

## WhatsApp Cloud API

Без `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` записи создаются, но уведомления пропускаются (`whatsapp_sent=false`, в календаре видна иконка ⚠).

Для включения: создать шаблон `booking_confirmation` в Meta Business Manager на ka/ru/en с параметрами тела `{{1}}`=имя, `{{2}}`=номер записи, `{{3}}`=услуги, `{{4}}`=дата, `{{5}}`=время, `{{6}}`=ссылка управления. Одобрение шаблона занимает от часов до дней — подать заранее.

`MANAGER_WHATSAPP_NUMBER` — номер заведения для уведомлений о новых записях.

## Архитектура

- `app/(public)/[locale]/` — клиентская часть (главная, запись, success, manage/[token])
- `app/(admin)/admin/` — админка (без locale-префикса; язык ka/ru через переключатель, хранится в localStorage)
- `app/api/` — slots, bookings (create + token ops), notify-whatsapp
- `lib/slots.ts`, `lib/tz.ts` — логика слотов, жёстко привязана к `Asia/Tbilisi`
- `lib/booking.ts` — серверная логика: график мастера → fallback на общий, поиск свободного мастера для "любого"
- `supabase/migrations/` — схема, RLS, RPC (token-gated), sequence для номеров, частичный unique-индекс против гонок

## Важные решения

- Все записи создаются через `create_booking` RPC (атомарный номер `BK-YYYY-NNNN` + связь услуг в одной транзакции).
- `unique_active_booking` блокирует двойную запись на один слот на уровне БД → API отвечает 409.
- Админский `force` обходит проверку конфликта, но не уникальный индекс (точное совпадение start_time всё равно заблокировано).
- Антиспам: honeypot-поле + rate limit 3 записи / 10 мин на IP.
- Запись возможна на 21 день вперёд (`MAX_BOOKING_DAYS_AHEAD`), шаг слота 30 мин (`SLOT_STEP_MINUTES`), слоты "прямо сейчас" отсекаются с запасом 30 мин.
- Телефон нормализуется в E.164 через libphonenumber-js (дефолт GE, другие страны разрешены).
- `postcss` в npm audit — build-time only (transitive dep Next.js), не влияет на рантайм.

## Иконки

`node scripts/generate-icons.mjs` — перегенерирует иконки из `public/logo.png`.
