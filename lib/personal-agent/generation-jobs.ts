import { prisma } from "@/lib/db/prisma";
import { isPersonalAgentOnline } from "./presence";

export const PERSONAL_FAILURE_CODES = [
  "conversation_not_found",
  "automation_changed",
  "response_timeout_before_submit",
  "ambiguous_after_submit",
] as const;
export type PersonalFailureCode = (typeof PERSONAL_FAILURE_CODES)[number];

export async function getPersonalGoogleConfiguration(ownerId: string) {
  const integration = await prisma.userIntegration.findUnique({
    where: { userId_provider: { userId: ownerId, provider: "google" } },
    select: { connectionMode: true },
  });
  if (integration?.connectionMode !== "personal") return { personal: false as const };
  const agent = await prisma.personalAgent.findUnique({
    where: { userId: ownerId },
    select: { id: true, revokedAt: true, lastSeenAt: true, adapterStatus: true },
  });
  if (!agent || agent.revokedAt || !isPersonalAgentOnline(agent.lastSeenAt)) {
    return { personal: true as const, operational: false as const, error: "agent_offline" };
  }
  if (agent.adapterStatus !== "ready") {
    const error = agent.adapterStatus === "chrome_unavailable" || agent.adapterStatus === "sign_in_required" || agent.adapterStatus === "gemini_unavailable"
      ? agent.adapterStatus : "gemini_unavailable";
    return { personal: true as const, operational: false as const, error };
  }
  return { personal: true as const, operational: true as const, agentId: agent.id };
}

export async function queuePersonalGeneration(attemptId: string, prompt: string) {
  const result = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, status: "streaming", executionMode: "api" },
    data: {
      executionMode: "personal",
      personalState: "queued",
      personalPrompt: prompt,
      usageState: "not_applicable",
      costState: "not_applicable",
      providerSnapshot: "google-personal",
      requestedModel: "gemini-personal",
    },
  });
  if (result.count !== 1) throw new Error("PERSONAL_QUEUE_CONFLICT");
}

function requestPayload(attempt: { id: string; personalPrompt: string | null; generation: { conversationId: number } }, remoteConversationId: string | null) {
  if (!attempt.personalPrompt) throw new Error("PERSONAL_PROMPT_MISSING");
  return {
    type: "generation.request" as const,
    protocolVersion: 1 as const,
    requestId: attempt.id,
    provider: "google" as const,
    remoteConversationId,
    prompt: attempt.personalPrompt,
  };
}

export async function claimNextPersonalGeneration(agentId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
    const active = await tx.aiGenerationAttempt.findFirst({
      where: { personalAgentId: agentId, personalState: { in: ["queued", "accepted", "submitted_to_provider"] } },
      orderBy: { reservedAt: "asc" },
      select: { id: true, personalPrompt: true, generation: { select: { conversationId: true } } },
    });
    let attempt = active;
    if (!attempt) {
      const queued = await tx.aiGenerationAttempt.findFirst({
        where: { executionMode: "personal", personalState: "queued", personalAgentId: null, generation: { conversation: { owner: { personalAgent: { is: { id: agentId, revokedAt: null } } } } } },
        orderBy: { reservedAt: "asc" },
        select: { id: true, personalPrompt: true, generation: { select: { conversationId: true } } },
      });
      if (!queued) return null;
      const claimed = await tx.aiGenerationAttempt.updateMany({ where: { id: queued.id, personalState: "queued", personalAgentId: null }, data: { personalAgentId: agentId, progressAt: new Date() } });
      if (claimed.count !== 1) return null;
      attempt = queued;
    }
    const mapping = await tx.providerConversation.findUnique({
      where: { conversationId_provider: { conversationId: attempt.generation.conversationId, provider: "google" } },
      select: { remoteConversationId: true },
    });
    return requestPayload(attempt, mapping?.remoteConversationId ?? null);
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code) : null;
    if (code !== "P2002" && code !== "P1008" && code !== "P2028") throw error;
    const active = await prisma.aiGenerationAttempt.findFirst({
      where: { personalAgentId: agentId, personalState: { in: ["queued", "accepted", "submitted_to_provider"] } },
      orderBy: { reservedAt: "asc" },
      select: { id: true, personalPrompt: true, generation: { select: { conversationId: true } } },
    });
    if (!active) return null;
    const mapping = await prisma.providerConversation.findUnique({
      where: { conversationId_provider: { conversationId: active.generation.conversationId, provider: "google" } },
      select: { remoteConversationId: true },
    });
    return requestPayload(active, mapping?.remoteConversationId ?? null);
  }
}

export async function applyPersonalGenerationEvent(agentId: string, event: {
  type: "generation.accepted" | "generation.submitted" | "generation.completed" | "generation.failed" | "generation.ambiguous";
  requestId: string;
  remoteConversationId?: string;
  response?: string;
  errorCode?: PersonalFailureCode;
}) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.aiGenerationAttempt.findFirst({
      where: { id: event.requestId, personalAgentId: agentId, executionMode: "personal" },
      select: { id: true, status: true, personalState: true, outputMessageId: true, generation: { select: { conversationId: true } } },
    });
    if (!attempt) throw new Error("job_not_found");
    const now = new Date();
    if (event.type === "generation.accepted") {
      if (attempt.personalState !== "queued") throw new Error("invalid_transition");
      const transition = await tx.aiGenerationAttempt.updateMany({ where: { id: attempt.id, status: "streaming", personalState: "queued" }, data: { personalState: "accepted", personalAcceptedAt: now, progressAt: now } });
      if (transition.count !== 1) throw new Error("invalid_transition");
    } else if (event.type === "generation.submitted") {
      if (attempt.personalState !== "accepted") throw new Error("invalid_transition");
      const transition = await tx.aiGenerationAttempt.updateMany({ where: { id: attempt.id, status: "streaming", personalState: "accepted" }, data: { personalState: "submitted_to_provider", personalSubmittedAt: now, providerInvokedAt: now, progressAt: now } });
      if (transition.count !== 1) throw new Error("invalid_transition");
    } else if (event.type === "generation.completed") {
      if (attempt.personalState !== "submitted_to_provider" || !event.remoteConversationId || typeof event.response !== "string" || !attempt.outputMessageId) throw new Error("invalid_transition");
      const transition = await tx.aiGenerationAttempt.updateMany({ where: { id: attempt.id, status: "streaming", personalState: "submitted_to_provider" }, data: { status: "completed", personalState: "completed", completedAt: now, progressAt: now, usageState: "not_applicable", costState: "not_applicable" } });
      if (transition.count !== 1) throw new Error("invalid_transition");
      const existing = await tx.providerConversation.findUnique({ where: { conversationId_provider: { conversationId: attempt.generation.conversationId, provider: "google" } } });
      if (existing && existing.remoteConversationId !== event.remoteConversationId) throw new Error("conversation_id_mismatch");
      if (!existing) await tx.providerConversation.create({ data: { conversationId: attempt.generation.conversationId, provider: "google", remoteConversationId: event.remoteConversationId } });
      await tx.message.update({ where: { id: attempt.outputMessageId }, data: { content: event.response } });
    } else if (event.type === "generation.failed") {
      if (!(["queued", "accepted"] as Array<string | null>).includes(attempt.personalState)) throw new Error("invalid_transition");
      const transition = await tx.aiGenerationAttempt.updateMany({ where: { id: attempt.id, status: "streaming", personalState: { in: ["queued", "accepted"] } }, data: { status: "failed", personalState: "failed", failedAt: now, progressAt: now, errorCode: event.errorCode } });
      if (transition.count !== 1) throw new Error("invalid_transition");
    } else {
      if (attempt.personalState !== "submitted_to_provider") throw new Error("invalid_transition");
      const transition = await tx.aiGenerationAttempt.updateMany({ where: { id: attempt.id, status: "streaming", personalState: "submitted_to_provider" }, data: { status: "failed", personalState: "ambiguous", failedAt: now, personalAmbiguousAt: now, progressAt: now, errorCode: "ambiguous_after_submit" } });
      if (transition.count !== 1) throw new Error("invalid_transition");
    }
    return true;
  });
}

type PersonalGenerationResult = {
  personalState: string | null;
  errorCode: string | null;
  outputMessage: { content: string } | null;
};

function resolvePersonalGenerationResult(current: PersonalGenerationResult | null) {
  if (!current) throw new Error("job_not_found");
  if (current.personalState === "completed") return current.outputMessage?.content ?? "";
  if (current.personalState === "ambiguous") throw new Error("ambiguous_after_submit");
  if (current.personalState === "failed") throw new Error(current.errorCode ?? "personal_generation_failed");
  throw new Error("personal_generation_state_conflict");
}

async function readPersonalGenerationResult(attemptId: string) {
  return prisma.aiGenerationAttempt.findUnique({
    where: { id: attemptId },
    select: { personalState: true, errorCode: true, outputMessage: { select: { content: true } } },
  });
}

/** @internal The callback is a deterministic synchronization point for persistence race tests. */
export async function settlePersonalGenerationTimeout(
  attemptId: string,
  now = new Date(),
  afterInitialAmbiguousMiss?: () => Promise<void>
) {
  const ambiguous = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, executionMode: "personal", status: "streaming", personalState: "submitted_to_provider" },
    data: { status: "failed", personalState: "ambiguous", errorCode: "ambiguous_after_submit", failedAt: now, personalAmbiguousAt: now, progressAt: now },
  });
  if (ambiguous.count === 1) throw new Error("ambiguous_after_submit");
  await afterInitialAmbiguousMiss?.();
  const failed = await prisma.aiGenerationAttempt.updateMany({
    where: { id: attemptId, executionMode: "personal", status: "streaming", personalState: { in: ["queued", "accepted"] } },
    data: { status: "failed", personalState: "failed", errorCode: "response_timeout_before_submit", failedAt: now, progressAt: now },
  });
  if (failed.count === 1) throw new Error("response_timeout_before_submit");
  let current = await readPersonalGenerationResult(attemptId);
  if (current?.personalState === "submitted_to_provider") {
    const finalAmbiguous = await prisma.aiGenerationAttempt.updateMany({
      where: { id: attemptId, executionMode: "personal", status: "streaming", personalState: "submitted_to_provider" },
      data: { status: "failed", personalState: "ambiguous", errorCode: "ambiguous_after_submit", failedAt: now, personalAmbiguousAt: now, progressAt: now },
    });
    if (finalAmbiguous.count === 1) throw new Error("ambiguous_after_submit");
    current = await readPersonalGenerationResult(attemptId);
  }
  return resolvePersonalGenerationResult(current);
}

export async function waitForPersonalGeneration(attemptId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const attempt = await readPersonalGenerationResult(attemptId);
    if (!attempt) throw new Error("job_not_found");
    if (attempt.personalState === "completed") return attempt.outputMessage?.content ?? "";
    if (attempt.personalState === "failed" || attempt.personalState === "ambiguous") throw new Error(attempt.errorCode ?? "personal_generation_failed");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return settlePersonalGenerationTimeout(attemptId);
}
