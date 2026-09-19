import { createBrowserClient } from '@supabase/ssr';

/** Browser client — used by the admin panel (authenticated) via RLS. */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
  );
}
