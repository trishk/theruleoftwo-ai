import { describe, expect, it } from "vitest";
import { calculateCost, formatNanoUsd, resolvePricing, type NormalizedUsage } from "@/lib/llm/usage/pricing";

const usage = (overrides: Partial<NormalizedUsage> = {}): NormalizedUsage => ({ inputTokens: 10n, inputTokensNoCache: 7n, inputTokensCacheRead: 3n, inputTokensCacheWrite: 0n, outputTokens: 2n, outputTextTokens: 1n, outputReasoningTokens: 1n, totalTokens: 12n, ...overrides });

describe("usage pricing", () => {
  it.each([
    ["openai", "gpt-5-mini", 5_825n], ["openai", "gpt-5", 29_125n],
    ["anthropic", "claude-haiku-4-5", 17_300n], ["anthropic", "claude-sonnet-4-5", 51_900n],
    ["google", "gemini-3.6-flash", 12_975n],
  ] as const)("prices %s/%s exactly", (provider, model, expected) => {
    expect(calculateCost(provider, model, new Date("2026-09-11T00:00:00Z"), usage())).toMatchObject({ state: "estimated", costNanoUsd: expected });
  });

  it("selects the dated Google rate", () => expect(resolvePricing("google", "gemini-3.6-flash", new Date("2027-01-01T00:00:00Z"))?.rates.input).toBe(1_500n));
  it("does not fuzzy-price unknown models", () => expect(calculateCost("google", "gemini-3.6-pro", new Date(), usage())).toEqual({ state: "unknown", reason: "pricing_unknown" }));
  it("refuses Anthropic cache writes with unknown TTL", () => expect(calculateCost("anthropic", "claude-haiku-4-5", new Date(), usage({ inputTokens: 11n, inputTokensCacheWrite: 1n, totalTokens: 13n }))).toEqual({ state: "unknown", reason: "cache_write_ttl_unknown" }));
  it("rejects inconsistent totals", () => expect(calculateCost("openai", "gpt-5", new Date(), usage({ totalTokens: 99n }))).toEqual({ state: "unknown", reason: "total_tokens_inconsistent" }));
  it("formats zero, sub-cent, and normal values", () => { expect(formatNanoUsd(0n)).toBe("$0.00"); expect(formatNanoUsd(1n)).toBe("<$0.01"); expect(formatNanoUsd(123_000_000n)).toBe("$0.12"); });
});
