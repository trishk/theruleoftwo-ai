import "server-only";
import type { Provider } from "../types";

const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;

type Rates = {
  input: bigint;
  cacheRead: bigint;
  cacheWrite: bigint | null;
  output: bigint;
};

export type PricingSnapshot = {
  version: string;
  currency: "USD";
  sourceUrl: string;
  rates: Rates;
};

type Entry = PricingSnapshot & {
  provider: Provider;
  model: string;
  effectiveFrom: string;
  effectiveTo?: string;
};

const OPENAI_SOURCE = "https://developers.openai.com/api/docs/pricing";
const ANTHROPIC_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
const GOOGLE_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing";

export const PRICING_CATALOG: readonly Entry[] = [
  { provider: "openai", model: "gpt-5-mini", version: "openai-standard-2026-09-11", currency: "USD", sourceUrl: OPENAI_SOURCE, effectiveFrom: "2026-09-11T00:00:00.000Z", rates: { input: 250n, cacheRead: 25n, cacheWrite: null, output: 2_000n } },
  { provider: "openai", model: "gpt-5", version: "openai-standard-2026-09-11", currency: "USD", sourceUrl: OPENAI_SOURCE, effectiveFrom: "2026-09-11T00:00:00.000Z", rates: { input: 1_250n, cacheRead: 125n, cacheWrite: null, output: 10_000n } },
  { provider: "anthropic", model: "claude-haiku-4-5", version: "anthropic-standard-2026-09-11", currency: "USD", sourceUrl: ANTHROPIC_SOURCE, effectiveFrom: "2026-09-11T00:00:00.000Z", rates: { input: 1_000n, cacheRead: 100n, cacheWrite: null, output: 5_000n } },
  { provider: "anthropic", model: "claude-sonnet-4-5", version: "anthropic-standard-2026-09-11", currency: "USD", sourceUrl: ANTHROPIC_SOURCE, effectiveFrom: "2026-09-11T00:00:00.000Z", rates: { input: 3_000n, cacheRead: 300n, cacheWrite: null, output: 15_000n } },
  { provider: "google", model: "gemini-3.6-flash", version: "google-standard-through-2026-12-31", currency: "USD", sourceUrl: GOOGLE_SOURCE, effectiveFrom: "2026-09-11T00:00:00.000Z", effectiveTo: "2027-01-01T00:00:00.000Z", rates: { input: 750n, cacheRead: 75n, cacheWrite: null, output: 3_750n } },
  { provider: "google", model: "gemini-3.6-flash", version: "google-standard-from-2027-01-01", currency: "USD", sourceUrl: GOOGLE_SOURCE, effectiveFrom: "2027-01-01T00:00:00.000Z", rates: { input: 1_500n, cacheRead: 150n, cacheWrite: null, output: 7_500n } },
] as const;

export type NormalizedUsage = {
  inputTokens: bigint;
  inputTokensNoCache: bigint;
  inputTokensCacheRead: bigint;
  inputTokensCacheWrite: bigint;
  outputTokens: bigint;
  outputTextTokens: bigint | null;
  outputReasoningTokens: bigint | null;
  totalTokens: bigint | null;
};

export function resolvePricing(provider: Provider, model: string, invokedAt: Date) {
  const time = invokedAt.getTime();
  return PRICING_CATALOG.find((entry) => entry.provider === provider && entry.model === model && time >= Date.parse(entry.effectiveFrom) && (!entry.effectiveTo || time < Date.parse(entry.effectiveTo))) ?? null;
}

export function calculateCost(provider: Provider, model: string, invokedAt: Date, usage: NormalizedUsage) {
  const pricing = resolvePricing(provider, model, invokedAt);
  if (!pricing) return { state: "unknown" as const, reason: "pricing_unknown" };
  if (usage.inputTokensNoCache + usage.inputTokensCacheRead + usage.inputTokensCacheWrite !== usage.inputTokens) return { state: "unknown" as const, reason: "input_tokens_inconsistent" };
  if (usage.totalTokens !== null && usage.totalTokens !== usage.inputTokens + usage.outputTokens) return { state: "unknown" as const, reason: "total_tokens_inconsistent" };
  if (usage.inputTokensCacheWrite > 0n && pricing.rates.cacheWrite === null) return { state: "unknown" as const, reason: "cache_write_ttl_unknown" };
  const parts = [
    usage.inputTokensNoCache * pricing.rates.input,
    usage.inputTokensCacheRead * pricing.rates.cacheRead,
    usage.inputTokensCacheWrite * (pricing.rates.cacheWrite ?? 0n),
    usage.outputTokens * pricing.rates.output,
  ];
  let cost = 0n;
  for (const part of parts) {
    if (part < 0n || part > MAX_SQLITE_INTEGER || cost > MAX_SQLITE_INTEGER - part) return { state: "unknown" as const, reason: "cost_overflow" };
    cost += part;
  }
  return { state: "estimated" as const, costNanoUsd: cost, pricing };
}

export function formatNanoUsd(value: bigint) {
  if (value === 0n) return "$0.00";
  if (value < 10_000_000n) return "<$0.01";
  const cents = (value + 5_000_000n) / 10_000_000n;
  return `$${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
