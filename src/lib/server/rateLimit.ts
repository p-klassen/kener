import { redisConnection } from "./redisConnector.js";

// In-memory fallback when Redis is unavailable
const MEMORY_STORE_MAX = 10_000;
const memoryStore = new Map<string, { count: number; resetAt: number }>();
let lastBypassWarnAt = 0;
const BYPASS_WARN_INTERVAL_MS = 60_000; // warn at most once per minute

// One-time token blocklist for password-reset JTIs (fallback when Redis is unavailable)
const USED_TOKENS_MAX = 1_000;
const usedTokens = new Map<string, number>(); // jti → expiry ms

/** Atomically claim a one-time token. Returns true if acquired (first use), false if already used. */
export async function acquireToken(jti: string, expiresAtMs: number): Promise<boolean> {
  const ttl = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000));
  try {
    const redis = redisConnection();
    // SET NX is atomic: returns "OK" on first write, null if key already exists
    const result = await redis.set(`used_token:${jti}`, "1", "EX", ttl, "NX");
    return result !== null;
  } catch {
    // JS is single-threaded so the in-memory path has no real race
    const exp = usedTokens.get(jti);
    if (exp && Date.now() <= exp) return false; // already used
    if (usedTokens.size < USED_TOKENS_MAX) {
      usedTokens.set(jti, expiresAtMs);
    }
    return true;
  }
}

/** Non-atomic read — use for early UX checks only (e.g. page load). Use acquireToken for actual enforcement. */
export async function isTokenUsed(jti: string): Promise<boolean> {
  try {
    const redis = redisConnection();
    return (await redis.get(`used_token:${jti}`)) !== null;
  } catch {
    const exp = usedTokens.get(jti);
    if (!exp) return false;
    if (Date.now() > exp) { usedTokens.delete(jti); return false; }
    return true;
  }
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  action: string,
  ip: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { windowMs, maxRequests } = options;
  const window = Math.floor(Date.now() / windowMs);
  const key = `ratelimit:${action}:${ip}:${window}`;
  const resetAt = (window + 1) * windowMs;

  try {
    const redis = redisConnection();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetAt,
    };
  } catch {
    // Redis unavailable — use in-memory fallback
    const now = Date.now();

    // Prune expired entries lazily to prevent unbounded memory growth
    for (const [k, v] of memoryStore) {
      if (v.resetAt <= now) memoryStore.delete(k);
    }

    const entry = memoryStore.get(key);
    if (!entry || entry.resetAt <= now) {
      if (memoryStore.size < MEMORY_STORE_MAX) {
        memoryStore.set(key, { count: 1, resetAt });
      } else {
        const now2 = Date.now();
        if (now2 - lastBypassWarnAt > BYPASS_WARN_INTERVAL_MS) {
          console.warn(`rateLimit: in-memory store full (${MEMORY_STORE_MAX} entries); bypassing rate limit`);
          lastBypassWarnAt = now2;
        }
      }
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }
    entry.count++;
    return {
      allowed: entry.count <= maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt,
    };
  }
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  // TRUSTED_PROXY_COUNT: number of trusted reverse-proxy hops in front of the app.
  // Set to the number of proxies (e.g. 1 for a single nginx/load-balancer) so the
  // correct client IP is selected from XFF instead of the spoofable leftmost entry.
  const raw = parseInt(process.env.TRUSTED_PROXY_COUNT ?? "", 10);
  const proxyCount = Number.isFinite(raw) && raw > 0 ? raw : null;
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim());
    if (proxyCount !== null && proxyCount > 0) {
      // Pick the Nth entry from the right — the first address the trusted proxy saw
      const idx = parts.length - proxyCount;
      return parts[Math.max(0, idx)];
    }
    return parts[0]; // legacy default: trust leftmost
  }
  return request.headers.get("x-real-ip") || "unknown";
}
