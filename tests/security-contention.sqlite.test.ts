// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/lib/generated/prisma/client";

const database = vi.hoisted(() => ({
  client: undefined as PrismaClient | undefined,
}));

vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!database.client) {
      throw new Error("Test database is not initialized.");
    }

    return database.client;
  },
}));

import {
  acquireGenerationLease,
} from "@/lib/security/generation-concurrency";
import { checkDailyQuota } from "@/lib/security/rate-limit";

let temporaryDirectory: string;

function getUtcDayStart(now: number) {
  const date = new Date(now);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "rule-of-two-security-")
  );

  const databasePath = path.join(
    temporaryDirectory,
    "contention.db"
  );

  database.client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: `file:${databasePath}`,
    }),
  });

  await database.client.$executeRawUnsafe(`
    CREATE TABLE "RateLimitBucket" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "windowStart" DATETIME NOT NULL,
      "count" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await database.client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key"
    ON "RateLimitBucket"("key", "windowStart")
  `);
  await database.client.$executeRawUnsafe(`
    CREATE INDEX "RateLimitBucket_windowStart_idx"
    ON "RateLimitBucket"("windowStart")
  `);
  await database.client.$executeRawUnsafe(`
    CREATE TABLE "LLMGenerationLease" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "userId" TEXT NOT NULL,
      "slot" INTEGER NOT NULL,
      "token" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX "LLMGenerationLease_token_key"
    ON "LLMGenerationLease"("token")
  `);
  await database.client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX "LLMGenerationLease_userId_slot_key"
    ON "LLMGenerationLease"("userId", "slot")
  `);
  await database.client.$executeRawUnsafe(`
    CREATE INDEX "LLMGenerationLease_expiresAt_idx"
    ON "LLMGenerationLease"("expiresAt")
  `);
});

afterAll(async () => {
  await database.client?.$disconnect();
  await rm(temporaryDirectory, {
    recursive: true,
    force: true,
  });
});

describe("real SQLite security contention", () => {
  it("atomically admits only one request for the owner's final daily quota unit", async () => {
    const ownerId = "quota-owner";
    const windowStart = getUtcDayStart(Date.now());

    await database.client!.rateLimitBucket.create({
      data: {
        key: `llm-daily:${ownerId}`,
        windowStart,
        count: 499,
      },
    });

    const results = await Promise.all([
      checkDailyQuota(ownerId),
      checkDailyQuota(ownerId),
    ]);

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);

    const bucket = await database.client!.rateLimitBucket.findUniqueOrThrow({
      where: {
        key_windowStart: {
          key: `llm-daily:${ownerId}`,
          windowStart,
        },
      },
    });

    expect(bucket.count).toBe(501);
  });

  it("atomically grants only one contender the owner's final lease slot", async () => {
    const ownerId = "lease-owner";
    const expiresAt = new Date(Date.now() + 60_000);

    await database.client!.lLMGenerationLease.createMany({
      data: [
        { userId: ownerId, slot: 1, token: "seed-1", expiresAt },
        { userId: ownerId, slot: 2, token: "seed-2", expiresAt },
      ],
    });

    const results = await Promise.all([
      acquireGenerationLease(ownerId),
      acquireGenerationLease(ownerId),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);

    const leases = await database.client!.lLMGenerationLease.findMany({
      where: { userId: ownerId },
      orderBy: { slot: "asc" },
    });

    expect(leases).toHaveLength(3);
    expect(leases.map((lease) => lease.slot)).toEqual([1, 2, 3]);
    expect(
      new Set(leases.map((lease) => `${lease.userId}:${lease.slot}`)).size
    ).toBe(3);
  });
});
