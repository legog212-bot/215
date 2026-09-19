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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'not configured: missing Supabase URL or Anon Key' }, { status: 503 });
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'empty_password' }, { status: 400 });
  }

  const hash = process.env.ADMIN_PANEL_PASSWORD_HASH;
  const authPassword = process.env.ADMIN_AUTH_PASSWORD;

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

  // Attempt 1: Direct sign-in using the entered password as admin@salon215.local password
  let authResult = await supabase.auth.signInWithPassword({
    email: ADMIN_AUTH_EMAIL,
    password: password,
  });

  // Attempt 2: If direct failed, check if entered password matches ADMIN_AUTH_PASSWORD or bcrypt hash
  if (authResult.error && authPassword) {
    let matches = password === authPassword;
    if (!matches && hash) {
      matches = await bcrypt.compare(password, hash).catch(() => false);
    }
    if (matches) {
      authResult = await supabase.auth.signInWithPassword({
        email: ADMIN_AUTH_EMAIL,
        password: authPassword,
      });
    }
  }

  if (authResult.error) {
    console.error('[Admin Login Error]:', authResult.error.message);
    return NextResponse.json(
      { error: authResult.error.message || 'invalid_credentials' },
      { status: 401 }
    );
  }

  return response;
}
