import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import bcrypt from 'bcryptjs';
import { rateLimitOk } from '@/lib/rate-limit';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
} from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// The manager only types a panel password. If it matches the bcrypt hash in
// env, the server signs into Supabase as the internal admin user — admin pages
// keep working through normal RLS-authenticated requests.

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimitOk(`admin-login:${ip}`)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const url = rawUrl.replace('mypbacnmusckjgdjupdt', 'mypbacnmusckjgdzupdt');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'not configured: missing Supabase URL or Anon Key' }, { status: 503 });
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'empty_password' }, { status: 400 });
  }

  const rawHash = process.env.ADMIN_PANEL_PASSWORD_HASH ?? '';
  const hash = rawHash.trim().replace(/^["']|["']$/g, '');
  const authPassword = (process.env.ADMIN_AUTH_PASSWORD ?? '').trim().replace(/^["']|["']$/g, '');

  if (!hash) {
    return NextResponse.json(
      { error: 'not_configured' },
      { status: 503 }
    );
  }

  // Pure bcrypt check against ADMIN_PANEL_PASSWORD_HASH
  const isValid = await bcrypt.compare(password, hash).catch(() => false);

  if (!isValid) {
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  // Password verified! Now establish the authenticated Supabase session for admin RLS queries
  const response = NextResponse.json({ ok: true });

  // Signed, httpOnly admin cookie — can't be forged by setting a value manually
  response.cookies.set(ADMIN_SESSION_COOKIE, await createAdminSessionToken(), {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            path: '/',
            sameSite: 'lax',
          })
        );
      },
    },
  });

  // Ensure Supabase user admin@salon215.local is signed in
  const targetEmail = 'admin@salon215.local';
  let session = null;
  let signRes = authPassword
    ? await supabase.auth.signInWithPassword({ email: targetEmail, password: authPassword })
    : { data: { session: null }, error: new Error('ADMIN_AUTH_PASSWORD not set') };

  if (signRes.error && authPassword) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const serviceClient = createServiceClient();
      const { data: usersData } = await serviceClient.auth.admin.listUsers();
      const existing = usersData?.users?.find((u) => u.email === targetEmail);
      if (existing) {
        await serviceClient.auth.admin.updateUserById(existing.id, {
          password: authPassword,
          email_confirm: true,
        });
      } else {
        await serviceClient.auth.admin.createUser({
          email: targetEmail,
          password: authPassword,
          email_confirm: true,
        });
      }
      signRes = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: authPassword,
      });
    } catch (e) {
      console.error('[Supabase session error]:', e);
    }
  }

  session = signRes.data?.session ?? null;

  const finalResponse = new NextResponse(JSON.stringify({ ok: true, session }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  for (const cookie of response.cookies.getAll()) {
    finalResponse.cookies.set(cookie);
  }

  return finalResponse;
}
