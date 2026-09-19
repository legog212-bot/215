import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import bcrypt from 'bcryptjs';
import { rateLimitOk } from '@/lib/rate-limit';

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

  // Check if entered password matches the admin bcrypt hash
  const isHashMatch = hash ? await bcrypt.compare(password, hash).catch(() => false) : false;

  // Potential credential pairs to sign into Supabase:
  const credentialsToTry: { email: string; pass: string }[] = [];

  // If password matched the bcrypt hash:
  if (isHashMatch) {
    if (authPassword) credentialsToTry.push({ email: 'admin@salon215.local', pass: authPassword });
    if (hash) credentialsToTry.push({ email: 'legog212@gmail.com', pass: hash });
  }

  // If user entered authPassword or hash directly:
  if (authPassword && password === authPassword) {
    credentialsToTry.push({ email: 'admin@salon215.local', pass: authPassword });
  }
  if (hash && password === hash) {
    credentialsToTry.push({ email: 'legog212@gmail.com', pass: hash });
  }

  // Direct login attempts with entered password:
  credentialsToTry.push({ email: 'admin@salon215.local', pass: password });
  credentialsToTry.push({ email: 'legog212@gmail.com', pass: password });

  let lastError: { message?: string } | null = null;
  let signedIn = false;

  for (const cred of credentialsToTry) {
    const { error } = await supabase.auth.signInWithPassword({
      email: cred.email,
      password: cred.pass,
    });
    if (!error) {
      signedIn = true;
      break;
    }
    lastError = error;
  }

  if (!signedIn) {
    console.error('[Admin Login Error]:', lastError?.message);
    return NextResponse.json(
      { error: lastError?.message || 'invalid_credentials' },
      { status: 401 }
    );
  }

  return response;
}
