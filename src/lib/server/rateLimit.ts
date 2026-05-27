import { redisConnection } from "./redisConnector.js";

// In-memory fallback when Redis is unavailable
const MEMORY_STORE_MAX = 10_000;
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// One-time token blocklist for password-reset JTIs (fallback when Redis is unavailable)
const usedTokens = new Map<string, number>(); // jti → expiry ms

export async function markTokenUsed(jti: string, expiresAtMs: number): Promise<void> {
  try {
    const redis = redisConnection();
    const ttl = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000));
    await redis.set(`used_token:${jti}`, "1", "EX", ttl);
  } catch {
    usedTokens.set(jti, expiresAtMs);
  }
}

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
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
