// @vitest-environment node

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDatabase = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!testDatabase.client) throw new Error("Test database is not initialized.");
    return testDatabase.client;
  },
}));
vi.mock("@/lib/security/encryption", () => ({ decryptSecret: () => "obviously-false-test-key" }));

import { prepareLLMRequest } from "@/lib/llm/prepare-request";
import type { StructuredConversationContext } from "@/lib/llm/context";

let directory: string;
let prisma: PrismaClient;
let conversationId: number;
let sourceMessageId: number;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rule-of-two-context-"));
  const databasePath = path.join(directory, "context.db");
  const sqlite = new Database(databasePath);
  const migrationDirectories = (await readdir(path.resolve("prisma", "migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migrationDirectory of migrationDirectories) {
    sqlite.exec(await readFile(path.join("prisma", "migrations", migrationDirectory, "migration.sql"), "utf8"));
  }
  sqlite.close();
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  testDatabase.client = prisma;
  await prisma.user.createMany({ data: [{ id: "owner", name: "Current Name" }] });
  const conversation = await prisma.conversation.create({ data: { title: "Context", ownerId: "owner" } });
  conversationId = conversation.id;
  await prisma.userIntegration.create({
    data: {
      userId: "owner",
      provider: "openai",
      selectedModel: "gpt-5-mini",
      encryptedApiKey: "fake-encrypted",
      keyIv: "fake-iv",
      keyAuthTag: "fake-tag",
    },
  });
  const source = await prisma.message.create({
    data: { conversationId, authorType: "human", authorId: "owner", content: "@chatgpt source" },
  });
  sourceMessageId = source.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await rm(directory, { recursive: true, force: true });
});

async function preparedDocument() {
  const request = await prepareLLMRequest({
    conversationId,
    sourceMessageId,
    provider: "openai",
    currentUserId: "owner",
    currentUserName: "ignored-call-site-name",
    ownerId: "owner",
  });
  return { request, document: JSON.parse(request.messages[0].content) as StructuredConversationContext };
}

describe("source-bounded shared context", () => {
  it("excludes sibling reserved, partial, completed, and later-human rows after the source", async () => {
    const generationData = [
      ["anthropic", "pending", ""],
      ["google", "streaming", "sibling partial"],
      ["openai", "completed", "sibling completed"],
    ] as const;
    for (const [provider, status, content] of generationData) {
      const output = await prisma.message.create({ data: { conversationId, authorType: "ai", authorId: provider, content } });
      await prisma.aiGeneration.create({
        data: {
          id: `generation-${provider}`,
          conversationId,
          sourceMessageId,
          provider,
          initialRequesterId: "owner",
          attempts: {
            create: {
              id: `attempt-${provider}`,
              attemptNumber: 1,
              requesterId: "owner",
              status,
              outputMessageId: output.id,
              ...(status === "completed" ? { completedAt: new Date() } : {}),
              ...(status === "streaming" ? { startedAt: new Date() } : {}),
            },
          },
        },
      });
    }
    await prisma.message.create({ data: { conversationId, authorType: "human", authorId: "owner", content: "later human" } });

    const { request, document } = await preparedDocument();
    expect(document.history).toEqual([]);
    expect(document.current_message.content).toBe("@chatgpt source");
    expect(request.messages[0].content).not.toMatch(/sibling|later human|attempt-|generation-|fake-encrypted|fake-iv|fake-tag/);
  });

  it("rebuilds retry context from the original boundary using current participant and model configuration", async () => {
    await prisma.user.update({ where: { id: "owner" }, data: { name: "Renamed Now" } });
    await prisma.userIntegration.update({
      where: { userId_provider: { userId: "owner", provider: "openai" } },
      data: { selectedModel: "gpt-5" },
    });
    const { request, document } = await preparedDocument();
    expect(request.model).toBe("gpt-5");
    expect(document.current_message.participant).toMatchObject({ display_name: "Renamed Now" });
    expect(document.history).toEqual([]);
  });

  it.each(["failed", "streaming"] as const)(
    "does not let a %s AI reply target bypass context eligibility",
    async (status) => {
      const conversation = await prisma.conversation.create({
        data: { title: `Reply ${status}`, ownerId: "owner" },
      });
      const origin = await prisma.message.create({
        data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: "origin" },
      });
      const output = await prisma.message.create({
        data: { conversationId: conversation.id, authorType: "ai", authorId: "openai", content: `${status} secret partial` },
      });
      await prisma.aiGeneration.create({
        data: {
          id: `reply-generation-${status}`,
          conversationId: conversation.id,
          sourceMessageId: origin.id,
          provider: "openai",
          initialRequesterId: "owner",
          attempts: {
            create: {
              id: `reply-attempt-${status}`,
              attemptNumber: 1,
              requesterId: "owner",
              status,
              outputMessageId: output.id,
              ...(status === "failed"
                ? { failedAt: new Date(), errorCode: "provider_failed" }
                : { startedAt: new Date() }),
            },
          },
        },
      });
      const source = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorType: "human",
          authorId: "owner",
          content: "@chatgpt reply safely",
          replyToId: output.id,
        },
      });

      const request = await prepareLLMRequest({
        conversationId: conversation.id,
        sourceMessageId: source.id,
        provider: "openai",
        currentUserId: "owner",
        currentUserName: "Current Name",
        ownerId: "owner",
      });
      const document = JSON.parse(request.messages[0].content) as StructuredConversationContext;
      expect(document.current_message.reply_to).toBeUndefined();
      expect(request.messages[0].content).not.toContain(`${status} secret partial`);
    }
  );
});
