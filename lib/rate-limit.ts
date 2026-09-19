import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './constants';

// Simple in-memory limiter. On Vercel it's per-instance — good enough as a first
// barrier alongside the honeypot; a DB-backed counter can replace it later.
const hits = new Map<string, number[]>();

export function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const window = hits.get(key)?.filter((t) => now - t < RATE_LIMIT_WINDOW_MS) ?? [];
  if (window.length >= RATE_LIMIT_MAX) {
    hits.set(key, window);
    return false;
  }
  window.push(now);
  hits.set(key, window);
  return true;
}
