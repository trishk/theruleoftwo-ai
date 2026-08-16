type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

const requests = new Map<
  string,
  RateLimitEntry
>();

let lastCleanupAt = 0;

function cleanupExpiredEntries(
  now: number
) {
  if (
    now - lastCleanupAt <
    WINDOW_MS
  ) {
    return;
  }

  lastCleanupAt = now;

  for (const [key, entry] of requests) {
    if (entry.resetAt <= now) {
      requests.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string
) {
  const now = Date.now();

  cleanupExpiredEntries(now);

  const existing =
    requests.get(key);

  if (
    !existing ||
    existing.resetAt <= now
  ) {
    requests.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  if (
    existing.count >= MAX_REQUESTS
  ) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (existing.resetAt - now) /
            1000
        )
      ),
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}