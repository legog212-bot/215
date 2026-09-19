import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const url = rawUrl.replace('mypbacnmusckjgdjupdt', 'mypbacnmusckjgdzupdt');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** Service-role client — bypasses RLS. Server-side only, never import in client code. */
export function createServiceClient() {
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon client for public server-side reads (services, hours). */
export function createAnonServerClient() {
  return createClient(url, anonKey || 'placeholder', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
