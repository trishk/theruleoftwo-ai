// @vitest-environment node

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/lib/generated/prisma/client";

const database = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db/prisma", () => ({ get prisma() { return database.client!; } }));

import { reserveGeneration, stopAttempt } from "@/lib/chat-stream/generation-lifecycle";
import { applyPersonalGenerationEvent, claimNextPersonalGeneration, queuePersonalGeneration, settlePersonalGenerationTimeout, waitForPersonalGeneration } from "@/lib/personal-agent/generation-jobs";
import { buildPersonalDeltaPrompt, PERSONAL_DELTA_FORMAT, PERSONAL_DELTA_MAX_CHARS } from "@/lib/personal-agent/delta-context";
import type { AgentConfig } from "../personal-agent/src/config.js";
import type { CredentialStore } from "../personal-agent/src/credential-store.js";
import type { PersonalAgentHttpClient } from "../personal-agent/src/http-client.js";
import { ExecutionJournal } from "../personal-agent/src/journal.js";
import type { Logger } from "../personal-agent/src/logger.js";
import { credentialFingerprint } from "../personal-agent/src/pairing.js";
import { PersonalAgentRuntime } from "../personal-agent/src/runtime.js";
import { AdapterExecutionError, type AgentEvent, type PersonalProviderAdapter } from "../personal-agent/src/types.js";

let directory: string;
let client: PrismaClient;

async function seedAttempt(suffix: string, sourceContent = `@gemini question ${suffix}`, ownerId = "owner") {
  const conversation = await client.conversation.create({ data: { title: suffix, ownerId } });
  const source = await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: ownerId, content: sourceContent } });
  const output = await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "google", content: "" } });
  const generation = await client.aiGeneration.create({ data: { id: `generation-${suffix}`, conversationId: conversation.id, sourceMessageId: source.id, provider: "google", initialRequesterId: ownerId } });
  const attempt = await client.aiGenerationAttempt.create({ data: { id: `attempt-${suffix}`, generationId: generation.id, attemptNumber: 1, requesterId: ownerId, status: "streaming", outputMessageId: output.id } });
  return { conversation, source, output, attempt };
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rule-of-two-personal-routing-"));
  const databasePath = path.join(directory, "routing.db");
  const sqlite = new Database(databasePath);
  const migrations = (await readdir(path.resolve("prisma", "migrations"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migration of migrations) sqlite.exec(await readFile(path.join("prisma", "migrations", migration, "migration.sql"), "utf8"));
  sqlite.close();
  client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  database.client = client;
  await client.user.create({ data: { id: "owner", name: "Owner" } });
  await client.personalAgent.create({ data: { id: "agent", userId: "owner", credentialHash: "false-hash", adapterStatus: "ready", lastSeenAt: new Date() } });
});

afterAll(async () => { await client.$disconnect(); await rm(directory, { recursive: true, force: true }); });

describe("Gemini Personal durable routing", () => {
  it("claims FIFO, serializes one active job, and recovers the same claim", async () => {
    const first = await seedAttempt("fifo-1");
    const second = await seedAttempt("fifo-2");
    await queuePersonalGeneration(first.attempt.id, "prompt-1");
    await queuePersonalGeneration(second.attempt.id, "prompt-2");
    const claim = await claimNextPersonalGeneration("agent");
    expect(claim).toMatchObject({ requestId: first.attempt.id, prompt: "prompt-1", remoteConversationId: null });
    await expect(claimNextPersonalGeneration("agent")).resolves.toEqual(claim);
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: second.attempt.id } })).toMatchObject({ personalAgentId: null, personalState: "queued" });
  });

  it("preserves one active job when two pollers claim concurrently", async () => {
    await client.user.create({ data: { id: "owner-concurrent", name: "Concurrent Owner" } });
    await client.personalAgent.create({ data: { id: "agent-concurrent", userId: "owner-concurrent", credentialHash: "false-concurrent-hash", adapterStatus: "ready", lastSeenAt: new Date() } });
    const first = await seedAttempt("concurrent-claim-1", undefined, "owner-concurrent");
    const second = await seedAttempt("concurrent-claim-2", undefined, "owner-concurrent");
    await queuePersonalGeneration(first.attempt.id, "concurrent-prompt-1");
    await queuePersonalGeneration(second.attempt.id, "concurrent-prompt-2");
    const claims = await Promise.all([
      claimNextPersonalGeneration("agent-concurrent"),
      claimNextPersonalGeneration("agent-concurrent"),
    ]);
    expect(claims[0]).toEqual(claims[1]);
    const active = await client.aiGenerationAttempt.findMany({
      where: { personalAgentId: "agent-concurrent", personalState: { in: ["queued", "accepted", "submitted_to_provider"] } },
    });
    expect(active).toHaveLength(1);
    expect(await client.aiGenerationAttempt.count({ where: { id: { in: [first.attempt.id, second.attempt.id] }, personalAgentId: null, personalState: "queued" } })).toBe(1);
  });

  it("enforces accepted/submitted/completed and creates the provider mapping", async () => {
    const active = await client.aiGenerationAttempt.findFirstOrThrow({ where: { personalAgentId: "agent", personalState: "queued" } });
    await expect(applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: active.id, remoteConversationId: "remote-1", response: "bad" })).rejects.toThrow("invalid_transition");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: active.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: active.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: active.id, remoteConversationId: "remote-1", response: "Gemini response" });
    const completed = await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: active.id }, include: { outputMessage: true } });
    expect(completed).toMatchObject({ status: "completed", personalState: "completed", usageState: "not_applicable", costState: "not_applicable" });
    expect(completed.outputMessage?.content).toBe("Gemini response");
    const mapping = await client.providerConversation.findFirstOrThrow({ where: { remoteConversationId: "remote-1" } });
    expect(mapping.provider).toBe("google");
  });

  it("reuses mapping and rejects an unexpected completion conversation id", async () => {
    const second = await claimNextPersonalGeneration("agent");
    expect(second?.remoteConversationId).toBeNull();
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: second!.requestId });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: second!.requestId });
    await applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: second!.requestId, remoteConversationId: "remote-2", response: "second conversation" });

    const prior = await client.aiGeneration.findUniqueOrThrow({ where: { id: `generation-fifo-1` } });
    const followSource = await client.message.create({ data: { conversationId: prior.conversationId, authorType: "human", authorId: "owner", content: "@gemini follow-up" } });
    const output = await client.message.create({ data: { conversationId: prior.conversationId, authorType: "ai", authorId: "google", content: "" } });
    await client.aiGeneration.create({ data: { id: "generation-reuse", conversationId: prior.conversationId, sourceMessageId: followSource.id, provider: "google", initialRequesterId: "owner", attempts: { create: { id: "attempt-reuse", attemptNumber: 1, requesterId: "owner", status: "streaming", outputMessageId: output.id } } } });
    await queuePersonalGeneration("attempt-reuse", "follow-up prompt");
    expect(await claimNextPersonalGeneration("agent")).toMatchObject({ requestId: "attempt-reuse", remoteConversationId: "remote-1" });
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: "attempt-reuse" });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: "attempt-reuse" });
    await expect(applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: "attempt-reuse", remoteConversationId: "unexpected", response: "bad" })).rejects.toThrow("conversation_id_mismatch");
  });

  it("marks post-submit loss ambiguous and blocks later context", async () => {
    await applyPersonalGenerationEvent("agent", { type: "generation.ambiguous", requestId: "attempt-reuse" });
    const source = await client.message.create({ data: { conversationId: (await client.aiGeneration.findUniqueOrThrow({ where: { id: "generation-reuse" } })).conversationId, authorType: "human", authorId: "owner", content: "@gemini blocked" } });
    await expect(buildPersonalDeltaPrompt({ conversationId: source.conversationId, sourceMessageId: source.id })).rejects.toThrow("ambiguous_after_submit");
  });

  it("rejects duplicate concurrent completion without duplicating output or mapping", async () => {
    const seeded = await seedAttempt("duplicate-completion");
    await queuePersonalGeneration(seeded.attempt.id, "duplicate prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: seeded.attempt.id });
    const results = await Promise.allSettled([
      applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: seeded.attempt.id, remoteConversationId: "remote-duplicate", response: "first completion" }),
      applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: seeded.attempt.id, remoteConversationId: "remote-duplicate", response: "second completion" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const stored = await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id }, include: { outputMessage: true } });
    expect(stored).toMatchObject({ status: "completed", personalState: "completed" });
    expect(["first completion", "second completion"]).toContain(stored.outputMessage?.content);
    expect(await client.providerConversation.count({ where: { conversationId: seeded.conversation.id, provider: "google" } })).toBe(1);
  });

  it("does not let Stop make a submitted Personal attempt retryable", async () => {
    const seeded = await seedAttempt("stop-retry");
    await queuePersonalGeneration(seeded.attempt.id, "stop retry prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: seeded.attempt.id });
    await expect(stopAttempt(seeded.attempt.id)).resolves.toBe("not_cancellable");
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({ status: "streaming", personalState: "submitted_to_provider" });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).rejects.toThrow("RETRY_NOT_ALLOWED");
    expect(await client.aiGenerationAttempt.count({ where: { generationId: `generation-stop-retry` } })).toBe(1);
    await applyPersonalGenerationEvent("agent", { type: "generation.ambiguous", requestId: seeded.attempt.id });
  });

  it("accepts ambiguity from accepted and prevents retry", async () => {
    const seeded = await seedAttempt("accepted-ambiguous");
    await queuePersonalGeneration(seeded.attempt.id, "accepted ambiguous prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.ambiguous", requestId: seeded.attempt.id });
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({
      status: "failed",
      personalState: "ambiguous",
      errorCode: "ambiguous_after_submit",
    });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).rejects.toThrow("RETRY_NOT_ALLOWED");
  });

  it("times out accepted as ambiguous and prevents retry", async () => {
    const seeded = await seedAttempt("accepted-timeout");
    await queuePersonalGeneration(seeded.attempt.id, "accepted timeout prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await expect(settlePersonalGenerationTimeout(seeded.attempt.id)).rejects.toThrow("ambiguous_after_submit");
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({
      status: "failed",
      personalState: "ambiguous",
      errorCode: "ambiguous_after_submit",
    });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).rejects.toThrow("RETRY_NOT_ALLOWED");
  });

  it("times out submitted as ambiguous and prevents retry", async () => {
    const seeded = await seedAttempt("submitted-timeout");
    await queuePersonalGeneration(seeded.attempt.id, "submitted timeout prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: seeded.attempt.id });
    await expect(settlePersonalGenerationTimeout(seeded.attempt.id)).rejects.toThrow("ambiguous_after_submit");
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({ personalState: "ambiguous" });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).rejects.toThrow("RETRY_NOT_ALLOWED");
  });

  it("keeps queued timeout retryable as a known pre-submit failure", async () => {
    const seeded = await seedAttempt("queued-timeout");
    await queuePersonalGeneration(seeded.attempt.id, "queued timeout prompt");
    await expect(settlePersonalGenerationTimeout(seeded.attempt.id)).rejects.toThrow("response_timeout_before_submit");
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({
      status: "failed",
      personalState: "failed",
      errorCode: "response_timeout_before_submit",
    });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).resolves.toMatchObject({ created: true, status: "pending" });
  });

  it("keeps explicit pre-send failure from accepted retryable", async () => {
    const seeded = await seedAttempt("accepted-explicit-failure");
    await queuePersonalGeneration(seeded.attempt.id, "accepted explicit failure prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.failed", requestId: seeded.attempt.id, errorCode: "automation_changed" });
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({
      status: "failed",
      personalState: "failed",
      errorCode: "automation_changed",
    });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).resolves.toMatchObject({ created: true, status: "pending" });
  });

  it("persists runtime post-Send uncertainty from accepted and prevents retry", async () => {
    const seeded = await seedAttempt("runtime-accepted-ambiguous");
    await queuePersonalGeneration(seeded.attempt.id, "runtime ambiguous prompt");
    const request = await claimNextPersonalGeneration("agent");
    expect(request).not.toBeNull();
    const runtimeAgentId = "00000000-0000-4000-8000-000000000001";
    const credential = `pa1.${runtimeAgentId}.${"A".repeat(43)}`;
    const config: AgentConfig = {
      baseUrl: "https://example.test",
      metadata: { agentId: runtimeAgentId, origin: "https://example.test", credentialFingerprint: credentialFingerprint(credential), pairedAt: "2026-01-01T00:00:00.000Z", version: 2 },
      dataDir: directory,
      pollWaitMs: 0,
      requestTimeoutMs: 100,
      heartbeatMs: 300_000,
      geminiCdpEndpoint: "http://127.0.0.1:9222",
      geminiHydrationTimeoutMs: 15_000,
      geminiResponseTimeoutMs: 120_000,
    };
    const adapter = {
      provider: "google",
      getStatus: async () => "ready" as const,
      execute: async () => { throw new AdapterExecutionError("automation_changed", true); },
    } satisfies PersonalProviderAdapter;
    const runtimeClient = {
      poll: vi.fn(async () => request),
      event: vi.fn(async (_credential: string, event: AgentEvent) => {
        if (event.type === "generation.accepted") await applyPersonalGenerationEvent("agent", event);
        if (event.type === "generation.ambiguous") {
          try { await applyPersonalGenerationEvent("agent", event); }
          finally { runtime.stop(); }
        }
      }),
    } as unknown as PersonalAgentHttpClient;
    const credentialStore = { get: async () => credential, set: async () => undefined, delete: async () => undefined } satisfies CredentialStore;
    const logger = { info: () => undefined, error: () => undefined } satisfies Logger;
    const runtime = new PersonalAgentRuntime({ config, client: runtimeClient, credentialStore, journal: new ExecutionJournal(path.join(directory, "runtime-ambiguity-journal.json")), adapter, logger });
    await runtime.run();
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({ personalState: "ambiguous" });
    await expect(reserveGeneration({ conversationId: seeded.conversation.id, sourceMessageId: seeded.source.id, provider: "google", requesterId: "owner", retryOfAttemptId: seeded.attempt.id })).rejects.toThrow("RETRY_NOT_ALLOWED");
  });

  it("does not let a completion event resurrect a legacy stopped Personal attempt", async () => {
    const seeded = await seedAttempt("legacy-stopped");
    await queuePersonalGeneration(seeded.attempt.id, "legacy stopped prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: seeded.attempt.id });
    await client.aiGenerationAttempt.update({ where: { id: seeded.attempt.id }, data: { status: "stopped", stoppedAt: new Date() } });
    await expect(applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: seeded.attempt.id, remoteConversationId: "remote-legacy-stopped", response: "must not persist" })).rejects.toThrow("invalid_transition");
    expect(await client.message.findUniqueOrThrow({ where: { id: seeded.output.id } })).toMatchObject({ content: "" });
    await client.aiGeneration.delete({ where: { id: `generation-legacy-stopped` } });
  });

  it("returns completion when it wins at the timeout deadline", async () => {
    const seeded = await seedAttempt("timeout-completion");
    await queuePersonalGeneration(seeded.attempt.id, "timeout race prompt");
    await claimNextPersonalGeneration("agent");
    await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    await applyPersonalGenerationEvent("agent", { type: "generation.submitted", requestId: seeded.attempt.id });
    const waiting = waitForPersonalGeneration(seeded.attempt.id, 1);
    await applyPersonalGenerationEvent("agent", { type: "generation.completed", requestId: seeded.attempt.id, remoteConversationId: "remote-timeout-race", response: "won the race" });
    await expect(waiting).resolves.toBe("won the race");
  });

  it("persists ambiguous when queued becomes accepted between timeout transitions", async () => {
    const seeded = await seedAttempt("timeout-accept-interleaving");
    await queuePersonalGeneration(seeded.attempt.id, "timeout accept prompt");
    await claimNextPersonalGeneration("agent");
    const settlement = settlePersonalGenerationTimeout(seeded.attempt.id, new Date(), async () => {
      await applyPersonalGenerationEvent("agent", { type: "generation.accepted", requestId: seeded.attempt.id });
    });
    await expect(settlement).rejects.toThrow("ambiguous_after_submit");
    expect(await client.aiGenerationAttempt.findUniqueOrThrow({ where: { id: seeded.attempt.id } })).toMatchObject({
      status: "failed",
      personalState: "ambiguous",
      errorCode: "ambiguous_after_submit",
      personalAmbiguousAt: expect.any(Date),
    });
  });

  it("builds bootstrap context with chronological peers and never drops the current message", async () => {
    const conversation = await client.conversation.create({ data: { title: "context", ownerId: "owner" } });
    await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: "human context" } });
    await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "anthropic", content: "Claude context" } });
    await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "openai", content: "OpenAI context" } });
    const current = await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: `@gemini ${"x".repeat(61_000)}` } });
    await expect(buildPersonalDeltaPrompt({ conversationId: conversation.id, sourceMessageId: current.id })).rejects.toThrow("PERSONAL_SOURCE_MESSAGE_TOO_LARGE");
  });

  it("truncates a huge current reply while preserving its relationship and source content", async () => {
    const conversation = await client.conversation.create({ data: { title: "reply bound", ownerId: "owner" } });
    const quoted = await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "openai", content: "q".repeat(100_000) } });
    const current = await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: "@gemini answer this reply", replyToId: quoted.id } });
    const built = await buildPersonalDeltaPrompt({ conversationId: conversation.id, sourceMessageId: current.id });
    const parsed = JSON.parse(built.prompt);
    const currentRecord = parsed.messages.at(-1);
    expect(built.prompt.length).toBeLessThanOrEqual(PERSONAL_DELTA_MAX_CHARS);
    expect(currentRecord.content).toBe(current.content);
    expect(currentRecord.replyTo).toMatchObject({ id: quoted.id, participant: "openai" });
    expect(currentRecord.replyTo.content.length).toBeLessThan(quoted.content.length);
    expect(parsed.format).toBe(PERSONAL_DELTA_FORMAT);
  });

  it("builds a subsequent delta with new human and peer messages but not the prior Gemini output", async () => {
    const conversation = await client.conversation.create({ data: { title: "delta", ownerId: "owner" } });
    const firstSource = await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: "@gemini first" } });
    const geminiOutput = await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "google", content: "prior Gemini output" } });
    await client.aiGeneration.create({ data: { id: "generation-delta-boundary", conversationId: conversation.id, sourceMessageId: firstSource.id, provider: "google", initialRequesterId: "owner", attempts: { create: { id: "attempt-delta-boundary", attemptNumber: 1, requesterId: "owner", status: "completed", outputMessageId: geminiOutput.id, executionMode: "personal", personalState: "completed", personalSubmittedAt: new Date(), completedAt: new Date() } } } });
    await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: "human after boundary" } });
    await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "openai", content: "OpenAI after boundary" } });
    await client.message.create({ data: { conversationId: conversation.id, authorType: "ai", authorId: "anthropic", content: "Claude after boundary" } });
    const current = await client.message.create({ data: { conversationId: conversation.id, authorType: "human", authorId: "owner", content: "@gemini current" } });
    const parsed = JSON.parse((await buildPersonalDeltaPrompt({ conversationId: conversation.id, sourceMessageId: current.id })).prompt);
    expect(parsed.mode).toBe("delta");
    expect(parsed.messages.map((message: { content: string }) => message.content)).toEqual(["human after boundary", "OpenAI after boundary", "Claude after boundary", "@gemini current"]);
    expect(JSON.stringify(parsed)).not.toContain("prior Gemini output");
  });
});
