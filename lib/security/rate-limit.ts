import { prisma } from "@/lib/db/prisma";

const MINUTE_WINDOW_MS =
  60_000;

const MAX_REQUESTS_PER_MINUTE =
  20;

const MAX_REQUESTS_PER_DAY =
  500;

const CLEANUP_INTERVAL_MS =
  60 * 60 * 1000;

const RETENTION_MS =
  2 * 24 * 60 * 60 * 1000;

let lastCleanupAt = 0;

function getMinuteWindowStart(
  now: number
) {
  return new Date(
    Math.floor(
      now / MINUTE_WINDOW_MS
    ) * MINUTE_WINDOW_MS
  );
}

function getUtcDayStart(
  now: number
) {
  const date = new Date(now);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

async function cleanupOldBuckets(
  now: number
) {
  if (
    now - lastCleanupAt <
    CLEANUP_INTERVAL_MS
  ) {
    return;
  }

  lastCleanupAt = now;

  await prisma.rateLimitBucket.deleteMany({
    where: {
      windowStart: {
        lt: new Date(
          now - RETENTION_MS
        ),
      },
    },
  });
}

async function consumeBucket({
  key,
  windowStart,
  windowEndsAt,
  limit,
}: {
  key: string;
  windowStart: Date;
  windowEndsAt: number;
  limit: number;
}) {
  const now = Date.now();

  const bucket =
    await prisma.rateLimitBucket.upsert({
      where: {
        key_windowStart: {
          key,
          windowStart,
        },
      },
      create: {
        key,
        windowStart,
        count: 1,
      },
      update: {
        count: {
          increment: 1,
        },
      },
      select: {
        count: true,
      },
    });

  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds:
        Math.max(
          1,
          Math.ceil(
            (windowEndsAt - now) /
              1000
          )
        ),
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

export async function checkRateLimit(
  key: string
) {
  const now = Date.now();

  await cleanupOldBuckets(now);

  const windowStart =
    getMinuteWindowStart(now);

  return consumeBucket({
    key,
    windowStart,
    windowEndsAt:
      windowStart.getTime() +
      MINUTE_WINDOW_MS,
    limit:
      MAX_REQUESTS_PER_MINUTE,
  });
}

export async function checkDailyQuota(
  userId: string
) {
  const now = Date.now();

  await cleanupOldBuckets(now);

  const windowStart =
    getUtcDayStart(now);

  const nextDay =
    new Date(windowStart);

  nextDay.setUTCDate(
    nextDay.getUTCDate() + 1
  );

  return consumeBucket({
    key: `llm-daily:${userId}`,
    windowStart,
    windowEndsAt:
      nextDay.getTime(),
    limit:
      MAX_REQUESTS_PER_DAY,
  });
}