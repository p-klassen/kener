import IORedis from "ioredis";
import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

let redisIOClient: IORedis | null = null;
let redisClient: IORedis | null = null;

export function redisIOConnection(): IORedis {
  if (!redisIOClient) {
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL is not defined in environment variables");
    }
    // commandTimeout must NOT be set here: BullMQ uses blocking commands (BLPOP/BRPOP)
    // with multi-second waits; a hard commandTimeout breaks the queue worker.
    redisIOClient = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
    });
    redisIOClient.on("error", (err) => console.error("[Redis] Connection error:", err));
  }
  return redisIOClient;
}

export function redisConnection(): Redis {
  if (!redisClient) {
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL is not defined in environment variables");
    }
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });
    redisClient.on("error", (err) => console.error("[Redis] Connection error:", err));
  }
  return redisClient;
}
