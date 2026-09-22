import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ok = await verifyAdminSession(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const url = rawUrl.replace('mypbacnmusckjgdjupdt', 'mypbacnmusckjgdzupdt');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
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

  const targetEmail = 'admin@salon215.local';
  const authPassword = (process.env.ADMIN_AUTH_PASSWORD ?? '').trim().replace(/^["']|["']$/g, '');
  if (!authPassword) {
    return NextResponse.json({ error: 'not configured: missing ADMIN_AUTH_PASSWORD' }, { status: 503 });
  }

  let signRes = await supabase.auth.signInWithPassword({
    email: targetEmail,
    password: authPassword,
  });

  if (signRes.error) {
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
      console.error('[Session endpoint sign in error]:', e);
    }
  }

  const session = signRes.data?.session ?? null;

  const finalResponse = new NextResponse(JSON.stringify({ ok: true, session }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  for (const cookie of response.cookies.getAll()) {
    finalResponse.cookies.set(cookie);
  }

  return finalResponse;
}
