import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { aiGenerationAttempt: { findMany } } }));

import { getConversationUsage, getConversationUsageSummary } from "@/lib/llm/usage/conversation-usage";

const base = {
  retryOfId: null, providerInvokedAt: new Date(), usageState: "captured", costState: "estimated",
  providerSnapshot: "openai", requestedModel: "gpt-requested", effectiveModel: "gpt-effective",
  inputTokens: 10n, inputTokensCacheRead: 2n, outputTokens: 3n, outputReasoningTokens: 1n,
  estimatedCostNanoUsd: 500_000n, costUnavailableReason: null, usageUnavailableReason: null,
};

describe("conversation usage aggregation", () => {
  beforeEach(() => findMany.mockReset());

  it("keeps estimated, unknown, pending, legacy, and not-applicable states distinct", async () => {
    findMany.mockResolvedValue([
      base,
      { ...base, retryOfId: "first", costState: "pending", usageState: "pending", estimatedCostNanoUsd: null },
      { ...base, costState: "unknown", usageState: "unavailable", estimatedCostNanoUsd: null, costUnavailableReason: "usage_unavailable" },
      { ...base, providerInvokedAt: null, usageState: null, costState: null, providerSnapshot: null, requestedModel: null, effectiveModel: null, estimatedCostNanoUsd: null },
      { ...base, providerInvokedAt: null, usageState: "not_applicable", costState: "not_applicable", estimatedCostNanoUsd: null },
    ]);
    const result = await getConversationUsage(1);
    expect(result.summary).toMatchObject({ knownAttemptCount: 1, unknownAttemptCount: 1, pendingAttemptCount: 1, legacyAttemptCount: 1, providerInvokedAttemptCount: 3 });
    expect(result.breakdown.flatMap((row) => Object.values(row)).some((value) => typeof value === "bigint")).toBe(false);
    expect(result.breakdown.reduce((sum, row) => sum + row.retries, 0)).toBe(1);
    expect(result.breakdown).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "openai", requestedModel: "gpt-requested", effectiveModel: "gpt-effective", pendingCount: 1, unknownCount: 1, notApplicableCount: 1 })]));
  });

  it("does not classify a lone pending attempt as unknown", async () => {
    findMany.mockResolvedValue([{ ...base, costState: "pending", usageState: "pending", estimatedCostNanoUsd: null }]);
    await expect(getConversationUsageSummary(1)).resolves.toMatchObject({ pendingAttemptCount: 1, unknownAttemptCount: 0, knownEstimatedCost: null });
  });

  it("returns an empty serializable result for a conversation without attempts", async () => {
    findMany.mockResolvedValue([]);
    await expect(getConversationUsage(1)).resolves.toEqual({
      summary: { knownEstimatedCost: null, knownAttemptCount: 0, unknownAttemptCount: 0, pendingAttemptCount: 0, legacyAttemptCount: 0, providerInvokedAttemptCount: 0 },
      breakdown: [],
    });
  });
});
