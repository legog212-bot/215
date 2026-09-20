// Signed admin session token — "knows the password = is admin", but the
// cookie itself can't be forged: it's an HMAC-signed expiry timestamp.
// Uses Web Crypto so it works both in Edge middleware and Node routes.

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const ADMIN_SESSION_MAX_AGE = Math.floor(MAX_AGE_MS / 1000);
export const ADMIN_SESSION_COOKIE = 'admin_session';

function secret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ??
    process.env.ADMIN_PANEL_PASSWORD_HASH ??
    ''
  ).trim();
}

async function hmac(msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createAdminSessionToken(): Promise<string> {
  const expiry = String(Date.now() + MAX_AGE_MS);
  return `${expiry}.${await hmac(expiry)}`;
}

export async function verifyAdminSession(token: string | undefined): Promise<boolean> {
  if (!token || !secret()) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;

  const expected = await hmac(expiry);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}
