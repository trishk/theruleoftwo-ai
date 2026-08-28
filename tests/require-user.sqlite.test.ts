// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/lib/generated/prisma/client";

const database = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!database.client) throw new Error("Test database is not initialized.");
    return database.client;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: auth.getUser } })),
}));

import { getCurrentUser } from "@/lib/auth/require-user";

let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "rule-of-two-require-user-"));
  database.client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: `file:${path.join(temporaryDirectory, "auth.db")}`,
    }),
  });
  await database.client.$executeRawUnsafe(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT,
      "name" TEXT,
      "avatarUrl" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
});

afterAll(async () => {
  await database.client?.$disconnect();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("require-user SQLite concurrency", () => {
  it("concurrent first requests converge on one correctly mapped user", async () => {
    const supabaseUser = {
      id: "concurrent-user",
      email: "concurrent@example.com",
      is_anonymous: false,
      user_metadata: {
        full_name: "Concurrent User",
        avatar_url: "https://example.com/concurrent.png",
      },
    };
    auth.getUser.mockImplementation(async () => ({
      data: { user: supabaseUser }, error: null,
    }));

    const results = await Promise.all(
      Array.from({ length: 8 }, () => getCurrentUser())
    );

    expect(results).toHaveLength(8);
    expect(results.every((user) => user?.id === supabaseUser.id)).toBe(true);
    expect(await database.client!.user.count({
      where: { id: supabaseUser.id },
    })).toBe(1);
    await expect(database.client!.user.findUniqueOrThrow({
      where: { id: supabaseUser.id },
    })).resolves.toMatchObject({
      email: supabaseUser.email,
      name: "Concurrent User",
      avatarUrl: "https://example.com/concurrent.png",
    });
  });

  it("a subsequent unchanged call preserves updatedAt", async () => {
    const before = await database.client!.user.findUniqueOrThrow({
      where: { id: "concurrent-user" },
    });

    const result = await getCurrentUser();
    const after = await database.client!.user.findUniqueOrThrow({
      where: { id: "concurrent-user" },
    });

    expect(result?.id).toBe("concurrent-user");
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});
