import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redisClient.on("connect", () => {
  console.log("Redis Connected ✅");
});

redisClient.on("error", (err) => {
  console.error("Redis connection error:", err);
});