import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatNanoUsd } from "./pricing";

export type ConversationUsageSummary = { knownEstimatedCost: string | null; knownAttemptCount: number; unknownAttemptCount: number; pendingAttemptCount: number; legacyAttemptCount: number; providerInvokedAttemptCount: number };
export type ConversationUsageBreakdown = { provider: string; requestedModel: string | null; effectiveModel: string | null; attempts: number; retries: number; inputTokens: string; cachedInputTokens: string; outputTokens: string; reasoningTokens: string; estimatedCost: string | null; unknownCount: number; pendingCount: number; legacyCount: number; notApplicableCount: number; unknownReason: string | null };

export async function getConversationUsageSummary(conversationId: number): Promise<ConversationUsageSummary> {
  const attempts = await prisma.aiGenerationAttempt.findMany({ where: { generation: { conversationId } }, select: { providerInvokedAt: true, usageState: true, costState: true, estimatedCostNanoUsd: true } });
  let knownCost = 0n, knownAttemptCount = 0, unknownAttemptCount = 0, pendingAttemptCount = 0, legacyAttemptCount = 0, providerInvokedAttemptCount = 0;
  for (const attempt of attempts) {
    if (attempt.providerInvokedAt) providerInvokedAttemptCount++;
    if (attempt.usageState === null) legacyAttemptCount++;
    if (attempt.costState === "estimated" && attempt.estimatedCostNanoUsd !== null) { knownCost += attempt.estimatedCostNanoUsd; knownAttemptCount++; }
    else if (attempt.costState === "unknown") unknownAttemptCount++;
    else if (attempt.costState === "pending") pendingAttemptCount++;
  }
  return { knownEstimatedCost: knownAttemptCount ? formatNanoUsd(knownCost) : null, knownAttemptCount, unknownAttemptCount, pendingAttemptCount, legacyAttemptCount, providerInvokedAttemptCount };
}

export async function getConversationUsage(conversationId: number) {
  const attempts = await prisma.aiGenerationAttempt.findMany({
    where: { generation: { conversationId } },
    select: { retryOfId: true, providerInvokedAt: true, usageState: true, costState: true, providerSnapshot: true, requestedModel: true, effectiveModel: true, inputTokens: true, inputTokensCacheRead: true, outputTokens: true, outputReasoningTokens: true, estimatedCostNanoUsd: true, costUnavailableReason: true, usageUnavailableReason: true },
  });
  let knownCost = 0n, knownAttemptCount = 0, unknownAttemptCount = 0, pendingAttemptCount = 0, legacyAttemptCount = 0, providerInvokedAttemptCount = 0;
  const groups = new Map<string, { provider: string; requestedModel: string | null; effectiveModel: string | null; attempts: number; retries: number; input: bigint; cached: bigint; output: bigint; reasoning: bigint; cost: bigint; known: number; unknown: number; pending: number; legacy: number; notApplicable: number; reason: string | null }>();
  for (const attempt of attempts) {
    if (attempt.providerInvokedAt) providerInvokedAttemptCount++;
    if (attempt.usageState === null) legacyAttemptCount++;
    if (attempt.costState === "estimated" && attempt.estimatedCostNanoUsd !== null) { knownCost += attempt.estimatedCostNanoUsd; knownAttemptCount++; }
    else if (attempt.costState === "unknown") unknownAttemptCount++;
    else if (attempt.costState === "pending") pendingAttemptCount++;
    const provider = attempt.providerSnapshot ?? "legacy";
    const key = `${provider}\0${attempt.requestedModel ?? ""}\0${attempt.effectiveModel ?? ""}`;
    const group = groups.get(key) ?? { provider, requestedModel: attempt.requestedModel, effectiveModel: attempt.effectiveModel, attempts: 0, retries: 0, input: 0n, cached: 0n, output: 0n, reasoning: 0n, cost: 0n, known: 0, unknown: 0, pending: 0, legacy: 0, notApplicable: 0, reason: null };
    group.attempts++; if (attempt.retryOfId) group.retries++;
    group.input += attempt.inputTokens ?? 0n; group.cached += attempt.inputTokensCacheRead ?? 0n; group.output += attempt.outputTokens ?? 0n; group.reasoning += attempt.outputReasoningTokens ?? 0n;
    if (attempt.costState === "estimated" && attempt.estimatedCostNanoUsd !== null) { group.cost += attempt.estimatedCostNanoUsd; group.known++; }
    else if (attempt.costState === "unknown") { group.unknown++; group.reason ??= attempt.costUnavailableReason ?? attempt.usageUnavailableReason ?? "unknown"; }
    else if (attempt.costState === "pending") group.pending++;
    else if (attempt.costState === "not_applicable") group.notApplicable++;
    else if (attempt.usageState === null && attempt.costState === null) group.legacy++;
    groups.set(key, group);
  }
  const summary: ConversationUsageSummary = { knownEstimatedCost: knownAttemptCount ? formatNanoUsd(knownCost) : null, knownAttemptCount, unknownAttemptCount, pendingAttemptCount, legacyAttemptCount, providerInvokedAttemptCount };
  const breakdown: ConversationUsageBreakdown[] = [...groups.values()].map((g) => ({ provider: g.provider, requestedModel: g.requestedModel, effectiveModel: g.effectiveModel, attempts: g.attempts, retries: g.retries, inputTokens: String(g.input), cachedInputTokens: String(g.cached), outputTokens: String(g.output), reasoningTokens: String(g.reasoning), estimatedCost: g.known ? formatNanoUsd(g.cost) : null, unknownCount: g.unknown, pendingCount: g.pending, legacyCount: g.legacy, notApplicableCount: g.notApplicable, unknownReason: g.reason }));
  return { summary, breakdown };
}
