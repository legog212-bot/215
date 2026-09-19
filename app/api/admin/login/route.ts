import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import bcrypt from 'bcryptjs';
import { rateLimitOk } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// The manager only types a panel password. If it matches the bcrypt hash in
// env, the server signs into Supabase as the internal admin user — admin pages
// keep working through normal RLS-authenticated requests.
const ADMIN_AUTH_EMAIL = 'admin@salon215.local';

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimitOk(`admin-login:${ip}`)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const hash = process.env.ADMIN_PANEL_PASSWORD_HASH;
  const authPassword = process.env.ADMIN_AUTH_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hash || !authPassword || !url || !anonKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  const ok = typeof password === 'string' && (await bcrypt.compare(password, hash));
  if (!ok) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_AUTH_EMAIL,
    password: authPassword,
  });
  if (error) {
    return NextResponse.json({ error: 'auth' }, { status: 500 });
  }
  return response;
}
