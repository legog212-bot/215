# Salon №215 CRM — project notes

## Commands

- `npm run dev` / `npm run build` / `npm run lint`
- `node scripts/generate-icons.mjs` — regenerate PWA icons from `public/logo.png`
- DB: apply `supabase/migrations/*.sql` via Supabase SQL Editor or `supabase db push`

## Conventions

- Route groups: `app/(public)/[locale]` (client site, next-intl ka/ru/en), `app/(admin)/admin` (admin panel, no locale prefix, own ka/ru dictionary in `messages/admin-*.json` via `useAdminT`)
- Timezone: all slot/date logic is pinned to `Asia/Tbilisi` via `lib/tz.ts` — never trust browser TZ
- Booking writes go through `create_booking` RPC (atomic order number + services); token-gated ops via `*_by_token` RPCs
- Admin uses the browser Supabase client (RLS `authenticated`); public API routes use the service-role key
- Brand colors: `--primary` gold `#C4A265`, `brand-ink` `#232323`
