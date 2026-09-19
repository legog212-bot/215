import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Session-bound client for server components / route handlers.
 * Respects RLS as the logged-in admin user.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(url, anonKey || 'placeholder', {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // called from a Server Component — middleware refreshes sessions
        }
      },
    },
  });
}
