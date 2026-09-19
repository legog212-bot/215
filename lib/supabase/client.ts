import { createBrowserClient } from '@supabase/ssr';

function normalizeSupabaseUrl(raw?: string): string {
  if (!raw) return 'https://placeholder.supabase.co';
  return raw.replace('mypbacnmusckjgdjupdt', 'mypbacnmusckjgdzupdt');
}

/** Browser client — used by the admin panel (authenticated) via RLS. */
export function createBrowserSupabase() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
  return createBrowserClient(url, anonKey);
}
