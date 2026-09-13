import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import type { Provider } from "@/lib/llm/types";
import { calculateCost, type NormalizedUsage } from "@/lib/llm/usage/pricing";

export const PENDING_STALE_MS = 2 * 60 * 1000;
export const STREAMING_STALE_MS = 10 * 60 * 1000;

export type GenerationStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "stopped";

export type GenerationReservation = {
  created: boolean;
  generationId: string;
  attemptId: string;
  status: GenerationStatus;
  outputMessageId: number | null;
  output: string | null;
};

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    String((error as { code?: unknown }).code) === "P2002";
}

function isReservationContention(error: unknown) {
  if (isUniqueConflict(error)) return true;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code) : null;
  return code === "P1008" || code === "P2028";
}

async function lookupGeneration(sourceMessageId: number, provider: Provider) {
  return prisma.aiGeneration.findUniqueOrThrow({
    where: { sourceMessageId_provider: { sourceMessageId, provider } },
    include: {
      attempts: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        include: { outputMessage: { select: { content: true } } },
      },
    },
  });
}

function toReservation(
  generation: Awaited<ReturnType<typeof lookupGeneration>>,
  created: boolean
): GenerationReservation {
  const attempt = generation.attempts[0];
  if (!attempt) throw new Error("GENERATION_ATTEMPT_MISSING");
  return {
    created,
    generationId: generation.id,
    attemptId: attempt.id,
    status: attempt.status as GenerationStatus,
    outputMessageId: attempt.outputMessageId,
    output: attempt.outputMessage?.content ?? null,
  };
}

export async function recoverStaleGenerations(
  sourceMessageId: number,
  provider: Provider,
  now = new Date()
) {
  const generation = await prisma.aiGeneration.findUnique({
    where: { sourceMessageId_provider: { sourceMessageId, provider } },
    select: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1, select: { id: true, status: true, progressAt: true, providerInvokedAt: true, executionMode: true } } },
  });
  const attempt = generation?.attempts[0];
  if (!attempt) return false;
  if (attempt.executionMode === "personal") return false;
  const threshold = attempt.status === "pending" ? PENDING_STALE_MS
    : attempt.status === "streaming" ? STREAMING_STALE_MS : null;
  if (threshold === null || attempt.progressAt.getTime() > now.getTime() - threshold) return false;
  const result = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attempt.id, status: attempt.status, progressAt: { lte: new Date(now.getTime() - threshold) } },
    data: { status: "failed", errorCode: "generation_interrupted", failedAt: now, ...(attempt.providerInvokedAt ? { usageState: "unavailable", costState: "unknown", usageUnavailableReason: "stale_after_provider_invocation", costUnavailableReason: "usage_unavailable" } : {}) },
  });
  return result.count === 1;
}

export async function recoverStaleGenerationsForConversation(conversationId: number, now = new Date()) {
  const pending = await prisma.aiGenerationAttempt.updateMany({
    where: { generation: { conversationId }, executionMode: "api", status: "pending", providerInvokedAt: null, progressAt: { lte: new Date(now.getTime() - PENDING_STALE_MS) } },
    data: { status: "failed", errorCode: "generation_interrupted", failedAt: now },
  });
  const pendingInvoked = await prisma.aiGenerationAttempt.updateMany({
    where: { generation: { conversationId }, executionMode: "api", status: "pending", providerInvokedAt: { not: null }, progressAt: { lte: new Date(now.getTime() - PENDING_STALE_MS) } },
    data: { status: "failed", errorCode: "generation_interrupted", failedAt: now, usageState: "unavailable", costState: "unknown", usageUnavailableReason: "stale_after_provider_invocation", costUnavailableReason: "usage_unavailable" },
  });
  const streaming = await prisma.aiGenerationAttempt.updateMany({
    where: { generation: { conversationId }, executionMode: "api", status: "streaming", providerInvokedAt: null, progressAt: { lte: new Date(now.getTime() - STREAMING_STALE_MS) } },
    data: { status: "failed", errorCode: "generation_interrupted", failedAt: now },
  });
  const streamingInvoked = await prisma.aiGenerationAttempt.updateMany({
    where: { generation: { conversationId }, executionMode: "api", status: "streaming", providerInvokedAt: { not: null }, progressAt: { lte: new Date(now.getTime() - STREAMING_STALE_MS) } },
    data: { status: "failed", errorCode: "generation_interrupted", failedAt: now, usageState: "unavailable", costState: "unknown", usageUnavailableReason: "stale_after_provider_invocation", costUnavailableReason: "usage_unavailable" },
  });
  return pending.count + pendingInvoked.count + streaming.count + streamingInvoked.count;
}

export async function reserveGeneration(args: {
  conversationId: number;
  sourceMessageId: number;
  provider: Provider;
  requesterId: string;
  retryOfAttemptId?: string;
}): Promise<GenerationReservation> {
  const { conversationId, sourceMessageId, provider, requesterId, retryOfAttemptId } = args;

  if (!retryOfAttemptId) {
    const generationId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    try {
      const outputMessageId = await prisma.$transaction(async (tx) => {
        const output = await tx.message.create({
          data: { conversationId, authorType: "ai", authorId: provider, content: "" },
        });
        await tx.aiGeneration.create({
          data: {
            id: generationId,
            conversationId,
            sourceMessageId,
            provider,
            initialRequesterId: requesterId,
            attempts: { create: { id: attemptId, attemptNumber: 1, requesterId, status: "pending", outputMessageId: output.id, usageState: "not_applicable", costState: "not_applicable" } },
          },
        });
        return output.id;
      });
      return { created: true, generationId, attemptId, status: "pending", outputMessageId, output: "" };
    } catch (error) {
      if (!isReservationContention(error)) throw error;
      return toReservation(await lookupGeneration(sourceMessageId, provider), false);
    }
  }

  const parent = await prisma.aiGenerationAttempt.findFirst({
    where: {
      id: retryOfAttemptId,
      generation: { sourceMessageId, provider, conversationId },
    },
    include: { generation: true, retriedBy: { include: { outputMessage: { select: { content: true } } } } },
  });
  if (!parent) throw new Error("RETRY_NOT_FOUND");
  if (parent.executionMode === "personal" && parent.personalState !== "failed") {
    throw new Error("RETRY_NOT_ALLOWED");
  }
  if (parent.status !== "failed" && parent.status !== "stopped") throw new Error("RETRY_NOT_ALLOWED");
  if (parent.retriedBy) {
    return {
      created: false,
      generationId: parent.generationId,
      attemptId: parent.retriedBy.id,
      status: parent.retriedBy.status as GenerationStatus,
      outputMessageId: parent.retriedBy.outputMessageId,
      output: parent.retriedBy.outputMessage?.content ?? null,
    };
  }
  const attemptId = crypto.randomUUID();
  try {
    const outputMessageId = await prisma.$transaction(async (tx) => {
      const output = await tx.message.create({
        data: { conversationId, authorType: "ai", authorId: provider, content: "" },
      });
      await tx.aiGenerationAttempt.create({
        data: {
          id: attemptId,
          generationId: parent.generationId,
          attemptNumber: parent.attemptNumber + 1,
          retryOfId: parent.id,
          requesterId,
          status: "pending",
          outputMessageId: output.id,
          usageState: "not_applicable",
          costState: "not_applicable",
        },
      });
      return output.id;
    });
    return { created: true, generationId: parent.generationId, attemptId, status: "pending", outputMessageId, output: "" };
  } catch (error) {
    if (!isReservationContention(error)) throw error;
    const existing = await prisma.aiGenerationAttempt.findUniqueOrThrow({
      where: { retryOfId: parent.id },
      include: { outputMessage: { select: { content: true } } },
    });
    return { created: false, generationId: parent.generationId, attemptId: existing.id, status: existing.status as GenerationStatus, outputMessageId: existing.outputMessageId, output: existing.outputMessage?.content ?? null };
  }
}

export async function failAttempt(attemptId: string, errorCode: string) {
  const now = new Date();
  return prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, status: { in: ["pending", "streaming"] } },
    data: { status: "failed", errorCode, failedAt: now },
  });
}

export async function startAttempt(args: { attemptId: string; conversationId: number; provider: Provider }) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.aiGenerationAttempt.findFirst({
      where: { id: args.attemptId, status: "pending", outputMessageId: { not: null } },
      select: { outputMessageId: true },
    });
    if (!attempt?.outputMessageId) throw new Error("ATTEMPT_OUTPUT_MISSING");
    const now = new Date();
    const transition = await tx.aiGenerationAttempt.updateMany({
      where: { id: args.attemptId, status: "pending", outputMessageId: attempt.outputMessageId },
      data: { status: "streaming", startedAt: now, progressAt: now },
    });
    if (transition.count !== 1) throw new Error("ATTEMPT_TRANSITION_CONFLICT");
    await tx.conversation.update({ where: { id: args.conversationId }, data: { updatedAt: now } });
    return attempt.outputMessageId;
  });
}

export async function markProviderInvoked(attemptId: string, snapshot: { provider: Provider; requestedModel: string }) {
  return prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, status: "streaming", providerInvokedAt: null },
    data: { providerInvokedAt: new Date(), usageState: "pending", costState: "pending", providerSnapshot: snapshot.provider, requestedModel: snapshot.requestedModel },
  });
}

export async function persistAttemptTelemetry(args: { attemptId: string; provider: Provider; requestedModel: string; capture: { usage: NormalizedUsage; effectiveModel: string | null } | { unavailableReason: string } }) {
  const attempt = await prisma.aiGenerationAttempt.findUnique({ where: { id: args.attemptId }, select: { usageState: true, providerInvokedAt: true } });
  if (!attempt?.providerInvokedAt || attempt.usageState !== "pending") return false;
  if ("unavailableReason" in args.capture) {
    const result = await prisma.aiGenerationAttempt.updateMany({ where: { id: args.attemptId, usageState: "pending" }, data: { usageState: "unavailable", costState: "unknown", usageUnavailableReason: args.capture.unavailableReason, costUnavailableReason: "usage_unavailable" } });
    return result.count === 1;
  }
  const model = args.capture.effectiveModel ?? args.requestedModel;
  const effectiveModelSource = args.capture.effectiveModel ? "provider" : "requested_fallback";
  const cost = calculateCost(args.provider, model, attempt.providerInvokedAt, args.capture.usage);
  const pricing = cost.state === "estimated" ? cost.pricing : null;
  const usage = args.capture.usage;
  const result = await prisma.aiGenerationAttempt.updateMany({ where: { id: args.attemptId, usageState: "pending" }, data: {
      usageState: "captured", costState: cost.state, effectiveModel: model, effectiveModelSource,
      inputTokens: usage.inputTokens, inputTokensNoCache: usage.inputTokensNoCache, inputTokensCacheRead: usage.inputTokensCacheRead, inputTokensCacheWrite: usage.inputTokensCacheWrite,
      outputTokens: usage.outputTokens, outputTextTokens: usage.outputTextTokens, outputReasoningTokens: usage.outputReasoningTokens, totalTokens: usage.totalTokens, usageCapturedAt: new Date(),
      pricingVersion: pricing?.version, pricingCurrency: pricing?.currency, inputRateNanoUsdPerToken: pricing?.rates.input,
      cacheReadRateNanoUsdPerToken: pricing?.rates.cacheRead, cacheWriteRateNanoUsdPerToken: pricing?.rates.cacheWrite, outputRateNanoUsdPerToken: pricing?.rates.output,
      estimatedCostNanoUsd: cost.state === "estimated" ? cost.costNanoUsd : null, costUnavailableReason: cost.state === "unknown" ? cost.reason : null,
  } });
  return result.count === 1;
}

export async function flushAttempt(attemptId: string, content: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.aiGenerationAttempt.findFirst({
      where: { id: attemptId, status: { in: ["streaming", "stopped"] } }, select: { outputMessageId: true },
    });
    if (!attempt?.outputMessageId) return false;
    await tx.message.update({ where: { id: attempt.outputMessageId }, data: { content } });
    const progress = await tx.aiGenerationAttempt.updateMany({
      where: { id: attemptId, status: { in: ["streaming", "stopped"] }, outputMessageId: attempt.outputMessageId },
      data: { progressAt: new Date() },
    });
    if (progress.count !== 1) throw new Error("ATTEMPT_TRANSITION_CONFLICT");
    return true;
  });
}

export async function completeAttempt(attemptId: string) {
  const now = new Date();
  const result = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, status: "streaming" },
    data: { status: "completed", completedAt: now, progressAt: now },
  });
  return result.count === 1;
}

export async function stopAttempt(attemptId: string) {
  const attempt = await prisma.aiGenerationAttempt.findUnique({
    where: { id: attemptId },
    select: { executionMode: true, status: true },
  });
  if (!attempt) return null;
  if (attempt.executionMode === "personal") return "not_cancellable" as const;
  const now = new Date();
  const result = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, executionMode: "api", status: { in: ["pending", "streaming"] } },
    data: { status: "stopped", stoppedAt: now },
  });
  if (result.count === 1) return "stopped" as const;
  const current = await prisma.aiGenerationAttempt.findUnique({ where: { id: attemptId }, select: { status: true } });
  return current?.status ?? null;
}

export async function getAttemptStatus(attemptId: string) {
  return prisma.aiGenerationAttempt.findUnique({ where: { id: attemptId }, select: { status: true } });
}

export async function heartbeatAttempt(attemptId: string) {
  const result = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, status: "streaming" },
    data: { progressAt: new Date() },
  });
  return result.count === 1;
}
