// @vitest-environment node

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const lifecycleDatabase = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!lifecycleDatabase.client) throw new Error("Lifecycle test database is not initialized.");
    return lifecycleDatabase.client;
  },
}));

import { flushAttempt, markProviderInvoked, persistAttemptTelemetry, reserveGeneration, stopAttempt } from "@/lib/chat-stream/generation-lifecycle";

let directory: string;
let first: PrismaClient;
let second: PrismaClient;
let conversationId: number;
let sourceMessageId: number;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rule-of-two-lifecycle-"));
  const databasePath = path.join(directory, "lifecycle.db");
  const sqlite = new Database(databasePath);
  const migrationDirectories = (await readdir(path.resolve("prisma", "migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migrationDirectory of migrationDirectories) {
    sqlite.exec(await readFile(path.join("prisma", "migrations", migrationDirectory, "migration.sql"), "utf8"));
  }
  sqlite.close();
  first = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  second = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  lifecycleDatabase.client = first;
  await first.user.create({ data: { id: "owner" } });
  const conversation = await first.conversation.create({ data: { title: "Test", ownerId: "owner" } });
  conversationId = conversation.id;
  const source = await first.message.create({ data: { conversationId, authorType: "human", authorId: "owner", content: "@chatgpt hello" } });
  sourceMessageId = source.id;
});

afterAll(async () => {
  await first?.$disconnect();
  await second?.$disconnect();
  await rm(directory, { recursive: true, force: true });
});

describe("generation lifecycle SQLite constraints", () => {
  it("persists an authoritative final snapshot after a streaming attempt is stopped", async () => {
    lifecycleDatabase.client = first;
    const source = await first.message.create({ data: { conversationId, authorType: "human", authorId: "owner", content: "stop during stream" } });
    const reserved = await reserveGeneration({ conversationId, sourceMessageId: source.id, provider: "google", requesterId: "owner" });
    await first.aiGenerationAttempt.update({ where: { id: reserved.attemptId }, data: { status: "streaming", startedAt: new Date() } });

    await expect(stopAttempt(reserved.attemptId)).resolves.toBe("stopped");
    await expect(flushAttempt(reserved.attemptId, "authoritative partial")).resolves.toBe(true);

    const attempt = await first.aiGenerationAttempt.findUniqueOrThrow({
      where: { id: reserved.attemptId },
      include: { outputMessage: { select: { content: true } } },
    });
    expect(attempt.status).toBe("stopped");
    expect(attempt.outputMessage?.content).toBe("authoritative partial");
    expect(attempt.completedAt).toBeNull();
    expect(attempt.failedAt).toBeNull();
  });

  it("atomically reserves an initial output and a separate retry output", async () => {
    const initial = await reserveGeneration({ conversationId, sourceMessageId, provider: "google", requesterId: "owner" });
    expect(initial).toMatchObject({ created: true, status: "pending", output: "" });
    expect(initial.outputMessageId).not.toBeNull();
    await first.aiGenerationAttempt.update({ where: { id: initial.attemptId }, data: { status: "failed", failedAt: new Date() } });

    const retry = await reserveGeneration({ conversationId, sourceMessageId, provider: "google", requesterId: "owner", retryOfAttemptId: initial.attemptId });
    expect(retry).toMatchObject({ created: true, status: "pending", output: "" });
    expect(retry.outputMessageId).not.toBe(initial.outputMessageId);
    expect(await first.message.count({ where: { generationAttempt: { generationId: initial.generationId } } })).toBe(2);
  });

  it("admits one concurrent human message for a scoped client id", async () => {
    const data = { conversationId, authorType: "human", authorId: "owner", content: "same", clientMessageId: "human-key", clientPayloadHash: "hash" };
    const results = await Promise.allSettled([first.message.create({ data }), second.message.create({ data })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await first.message.count({ where: { conversationId, authorId: "owner", clientMessageId: "human-key" } })).toBe(1);
  });

  it("admits one generation and initial attempt under contention", async () => {
    const create = (client: PrismaClient, id: string, attemptId: string) => client.$transaction(async (tx) => {
      const output = await tx.message.create({ data: { conversationId, authorType: "ai", authorId: "openai", content: "" } });
      return tx.aiGeneration.create({
        data: { id, conversationId, sourceMessageId, provider: "openai", initialRequesterId: "owner", attempts: { create: { id: attemptId, attemptNumber: 1, requesterId: "owner", status: "pending", outputMessageId: output.id } } },
      });
    });
    const results = await Promise.allSettled([create(first, "generation-a", "attempt-a"), create(second, "generation-b", "attempt-b")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const generation = await first.aiGeneration.findUniqueOrThrow({ where: { sourceMessageId_provider: { sourceMessageId, provider: "openai" } }, include: { attempts: true } });
    expect(generation.attempts).toHaveLength(1);
    expect(generation.attempts[0]?.attemptNumber).toBe(1);
    expect(generation.attempts[0]?.outputMessageId).not.toBeNull();
    expect(await first.message.count({ where: { generationAttempt: { generationId: generation.id } } })).toBe(1);
  }, 15_000);

  it("admits one retry child and one output message per attempt", async () => {
    const generation = await first.aiGeneration.findUniqueOrThrow({ where: { sourceMessageId_provider: { sourceMessageId, provider: "openai" } }, include: { attempts: true } });
    const parent = generation.attempts[0]!;
    await first.aiGenerationAttempt.update({ where: { id: parent.id }, data: { status: "failed", failedAt: new Date() } });
    const createRetry = (client: PrismaClient, id: string) => client.$transaction(async (tx) => {
      const output = await tx.message.create({ data: { conversationId, authorType: "ai", authorId: "openai", content: "" } });
      return tx.aiGenerationAttempt.create({ data: { id, generationId: generation.id, attemptNumber: 2, retryOfId: parent.id, requesterId: "owner", status: "pending", outputMessageId: output.id } });
    });
    const results = await Promise.allSettled([createRetry(first, "retry-a"), createRetry(second, "retry-b")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await first.aiGenerationAttempt.count({ where: { retryOfId: parent.id } })).toBe(1);
    expect(await first.message.count({ where: { generationAttempt: { retryOfId: parent.id } } })).toBe(1);
  }, 15_000);

  it("rejects two terminal timestamps", async () => {
    const retry = await first.aiGenerationAttempt.findFirstOrThrow({ where: { retryOfId: { not: null } } });
    await expect(first.$executeRawUnsafe(
      `UPDATE "AiGenerationAttempt" SET "status" = 'completed', "completedAt" = CURRENT_TIMESTAMP, "failedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      retry.id
    )).rejects.toThrow();
  });

  it("keeps telemetry capture idempotent under distinct-connection contention", async () => {
    lifecycleDatabase.client = first;
    const reserved = await reserveGeneration({ conversationId, sourceMessageId, provider: "anthropic", requesterId: "owner" });
    await first.aiGenerationAttempt.update({ where: { id: reserved.attemptId }, data: { status: "streaming", startedAt: new Date() } });
    await markProviderInvoked(reserved.attemptId, { provider: "anthropic", requestedModel: "claude-sonnet-4-5" });
    const capture = { usage: { inputTokens: 2n, inputTokensNoCache: 2n, inputTokensCacheRead: 0n, inputTokensCacheWrite: 0n, outputTokens: 1n, outputTextTokens: 1n, outputReasoningTokens: null, totalTokens: 3n }, effectiveModel: null };
    lifecycleDatabase.client = first;
    const captured = persistAttemptTelemetry({ attemptId: reserved.attemptId, provider: "anthropic", requestedModel: "claude-sonnet-4-5", capture });
    lifecycleDatabase.client = second;
    const unavailable = persistAttemptTelemetry({ attemptId: reserved.attemptId, provider: "anthropic", requestedModel: "claude-sonnet-4-5", capture: { unavailableReason: "usage_rejected" } });
    const results = await Promise.all([captured, unavailable]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const attempt = await first.aiGenerationAttempt.findUniqueOrThrow({ where: { id: reserved.attemptId } });
    expect(["captured", "unavailable"]).toContain(attempt.usageState);
    expect(attempt.status).toBe("streaming");
    expect(attempt.completedAt).toBeNull();
    expect(attempt.failedAt).toBeNull();
    expect(attempt.stoppedAt).toBeNull();
    lifecycleDatabase.client = first;
  }, 15_000);

  it("persists the captured usage, model, pricing rates, and nano-USD snapshot", async () => {
    lifecycleDatabase.client = first;
    const source = await first.message.create({ data: { conversationId, authorType: "human", authorId: "owner", content: "priced" } });
    const reserved = await reserveGeneration({ conversationId, sourceMessageId: source.id, provider: "openai", requesterId: "owner" });
    await first.aiGenerationAttempt.update({ where: { id: reserved.attemptId }, data: { status: "streaming", startedAt: new Date() } });
    await markProviderInvoked(reserved.attemptId, { provider: "openai", requestedModel: "gpt-5" });
    await expect(persistAttemptTelemetry({ attemptId: reserved.attemptId, provider: "openai", requestedModel: "gpt-5", capture: { usage: { inputTokens: 3n, inputTokensNoCache: 2n, inputTokensCacheRead: 1n, inputTokensCacheWrite: 0n, outputTokens: 2n, outputTextTokens: 1n, outputReasoningTokens: 1n, totalTokens: 5n }, effectiveModel: "gpt-5" } })).resolves.toBe(true);
    await expect(first.aiGenerationAttempt.findUniqueOrThrow({ where: { id: reserved.attemptId } })).resolves.toMatchObject({
      providerSnapshot: "openai", requestedModel: "gpt-5", effectiveModel: "gpt-5", effectiveModelSource: "provider",
      inputTokens: 3n, inputTokensNoCache: 2n, inputTokensCacheRead: 1n, outputTokens: 2n, outputTextTokens: 1n, outputReasoningTokens: 1n, totalTokens: 5n,
      usageState: "captured", costState: "estimated", pricingVersion: "openai-standard-2026-09-11", pricingCurrency: "USD",
      inputRateNanoUsdPerToken: 1_250n, cacheReadRateNanoUsdPerToken: 125n, cacheWriteRateNanoUsdPerToken: null, outputRateNanoUsdPerToken: 10_000n,
      estimatedCostNanoUsd: 22_625n,
    });
  });
});
