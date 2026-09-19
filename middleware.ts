import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function adminGuard(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const hasAdminCookie = request.cookies.get('admin_session')?.value === 'true';

  let isAuthed = hasAdminCookie;
  if (!isAuthed && supabaseUrl && supabaseKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();
      isAuthed = Boolean(user);
    } catch {
      isAuthed = false;
    }
  }

  if (!isAuthed && pathname !== '/admin/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }
  if (isAuthed && pathname === '/admin/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/calendar';
    return NextResponse.redirect(url);
  }
  return response;
}

export default async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    return adminGuard(request);
  }
  return intlMiddleware(request);
}

export const config = {
  // everything except api routes, next internals and files with extensions
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
