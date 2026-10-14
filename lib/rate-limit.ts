// lib/rate-limit.ts
// Rate limit simple: sliding window 20 request per menit per key.
// Whitelist bisa ditambah nanti via ENV RATE_LIMIT_WHITELIST_KEYS.

const WINDOW_MS = 60_000;   // 1 menit
const MAX_REQUESTS = 20;    // 20 request per menit

type Bucket = number[];
const buckets = new Map<string, Bucket>();

/* ========================================================================== */
/* Cleanup periodic                                                           */
/* ========================================================================== */

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of buckets.entries()) {
      const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
      if (fresh.length === 0) buckets.delete(key);
      else buckets.set(key, fresh);
    }
  }, WINDOW_MS).unref?.();
}

/* ========================================================================== */
/* Whitelist (opsional — tinggal isi ENV nanti)                              */
/* ========================================================================== */

/**
 * Whitelist via ENV: RATE_LIMIT_WHITELIST_KEYS
 * Contoh: "127.0.0.1,::1,my-session-abc"
 * Kalau ENV kosong → tidak ada yang di-whitelist (semua kena limit).
 */
function getWhitelist(): Set<string> {
  const raw = process.env.RATE_LIMIT_WHITELIST_KEYS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isWhitelisted(key: string): boolean {
  if (!key) return false;
  return getWhitelist().has(key);
}

/* ========================================================================== */
/* Public API                                                                 */
/* ========================================================================== */

export function checkRateLimit(key: string): boolean {
  // Whitelist bypass (kalau ENV diisi)
  if (isWhitelisted(key)) return true;

  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter(
    (t) => now - t < WINDOW_MS
  );

  if (timestamps.length >= MAX_REQUESTS) {
    buckets.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

export function getRateLimitInfo(key: string) {
  if (isWhitelisted(key)) {
    return { remaining: 9999, resetInSeconds: 0 };
  }
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter(
    (t) => now - t < WINDOW_MS
  );
  const remaining = Math.max(0, MAX_REQUESTS - timestamps.length);
  const resetInMs =
    timestamps.length > 0 ? WINDOW_MS - (now - timestamps[0]) : 0;
  return { remaining, resetInSeconds: Math.ceil(resetInMs / 1000) };
}

export function _resetRateLimit() {
  buckets.clear();
}