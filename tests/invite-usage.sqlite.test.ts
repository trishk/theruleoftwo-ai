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

import { joinConversation } from "@/lib/invites/join-conversation";

let temporaryDirectory: string;

async function createFixture(token: string, usageCount = 0) {
  const ownerId = `owner-${token}`;
  await database.client!.user.create({
    data: { id: ownerId },
  });
  const conversation = await database.client!.conversation.create({
    data: {
      ownerId,
      title: token,
    },
  });
  await database.client!.conversationInvite.create({
    data: {
      conversationId: conversation.id,
      token,
      createdById: ownerId,
      expiresAt: new Date(Date.now() + 60_000),
      usageCount,
    },
  });
  return { conversation, ownerId };
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "rule-of-two-invites-")
  );
  const databasePath = path.join(temporaryDirectory, "invites.db");
  database.client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: `file:${databasePath}`,
    }),
  });

  await database.client.$executeRawUnsafe(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT,
      "name" TEXT,
      "avatarUrl" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.client.$executeRawUnsafe(`
    CREATE TABLE "Conversation" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "publicId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "ownerId" TEXT NOT NULL,
      "allowMemberAiUsage" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
    )
  `);
  await database.client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "Conversation_publicId_key" ON "Conversation"("publicId")`
  );
  await database.client.$executeRawUnsafe(`
    CREATE TABLE "ConversationInvite" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "conversationId" INTEGER NOT NULL,
      "token" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" DATETIME,
      "revokedAt" DATETIME,
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
    )
  `);
  await database.client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "ConversationInvite_token_key" ON "ConversationInvite"("token")`
  );
  await database.client.$executeRawUnsafe(`
    CREATE TABLE "ConversationMember" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "conversationId" INTEGER NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'member',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )
  `);
  await database.client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId")`
  );
});

afterAll(async () => {
  await database.client?.$disconnect();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("invite usage with real SQLite transactions", () => {
  it("admits ten distinct members and rejects the eleventh", async () => {
    const { conversation } = await createFixture("ten-uses");

    for (let index = 1; index <= 10; index += 1) {
      await joinConversation({
        token: "ten-uses",
        userId: `guest-${index}`,
        guestName: `Guest ${index}`,
      });
    }

    await expect(
      joinConversation({
        token: "ten-uses",
        userId: "guest-11",
        guestName: "Guest 11",
      })
    ).rejects.toThrow("Invite usage limit reached.");

    expect(
      await database.client!.conversationMember.count({
        where: { conversationId: conversation.id },
      })
    ).toBe(10);
    expect(
      await database.client!.user.findUnique({
        where: { id: "guest-11" },
      })
    ).toBeNull();
  });

  it("does not charge an existing member again", async () => {
    await createFixture("repeat-member");
    await joinConversation({
      token: "repeat-member",
      userId: "repeat-user",
      guestName: "Repeat",
    });
    await joinConversation({
      token: "repeat-member",
      userId: "repeat-user",
    });

    const invite = await database.client!.conversationInvite.findUniqueOrThrow({
      where: { token: "repeat-member" },
    });
    expect(invite.usageCount).toBe(1);
  });

  it("does not exceed the limit under concurrent joins", async () => {
    const { conversation } = await createFixture("concurrent", 9);

    const results = await Promise.allSettled([
      joinConversation({
        token: "concurrent",
        userId: "concurrent-a",
        guestName: "A",
      }),
      joinConversation({
        token: "concurrent",
        userId: "concurrent-b",
        guestName: "B",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled"))
      .toHaveLength(1);
    expect(
      await database.client!.conversationMember.count({
        where: { conversationId: conversation.id },
      })
    ).toBe(1);
    const invite = await database.client!.conversationInvite.findUniqueOrThrow({
      where: { token: "concurrent" },
    });
    expect(invite.usageCount).toBe(10);
  });

  it("treats concurrent joins by the same user as idempotent", async () => {
    const { conversation } = await createFixture("same-user");

    const results = await Promise.all([
      joinConversation({
        token: "same-user",
        userId: "same-user-id",
        guestName: "Same User",
      }),
      joinConversation({
        token: "same-user",
        userId: "same-user-id",
        guestName: "Same User",
      }),
    ]);

    expect(results.every((result) => result.conversationId === conversation.id))
      .toBe(true);
    expect(
      await database.client!.conversationMember.count({
        where: { conversationId: conversation.id },
      })
    ).toBe(1);
    const invite = await database.client!.conversationInvite.findUniqueOrThrow({
      where: { token: "same-user" },
    });
    expect(invite.usageCount).toBe(1);
  });

  it("charges only one of two concurrent invite tokens for the same user", async () => {
    const { conversation, ownerId } =
      await createFixture("first-token");
    await database.client!.conversationInvite.create({
      data: {
        conversationId: conversation.id,
        token: "second-token",
        createdById: ownerId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const results = await Promise.all([
      joinConversation({
        token: "first-token",
        userId: "dual-token-user",
        guestName: "Dual Token",
      }),
      joinConversation({
        token: "second-token",
        userId: "dual-token-user",
        guestName: "Dual Token",
      }),
    ]);

    expect(results.every((result) => result.conversationId === conversation.id))
      .toBe(true);
    expect(
      await database.client!.conversationMember.count({
        where: { conversationId: conversation.id },
      })
    ).toBe(1);
    const invites = await database.client!.conversationInvite.findMany({
      where: { conversationId: conversation.id },
    });
    expect(
      invites.reduce((total, invite) => total + invite.usageCount, 0)
    ).toBe(1);
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1_000) }],
    ["revoked", { revokedAt: new Date() }],
  ])("rejects an %s invite", async (token, data) => {
    await createFixture(token);
    await database.client!.conversationInvite.update({
      where: { token },
      data,
    });

    await expect(
      joinConversation({
        token,
        userId: `${token}-user`,
        guestName: "Blocked",
      })
    ).rejects.toThrow(/expired|revoked/);
  });
});
