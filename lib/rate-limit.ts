const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
type Bucket = number[];
const buckets = new Map<string, Bucket>();

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

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) {
    buckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

export function getRateLimitInfo(key: string) {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const remaining = Math.max(0, MAX_REQUESTS - timestamps.length);
  const resetInMs = timestamps.length > 0 ? WINDOW_MS - (now - timestamps[0]) : 0;
  return { remaining, resetInSeconds: Math.ceil(resetInMs / 1000) };
}

export function _resetRateLimit() { buckets.clear(); }