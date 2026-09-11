import "server-only";
import type { LanguageModelUsage } from "ai";
import type { NormalizedUsage } from "./pricing";

type StreamResult = {
  usage: PromiseLike<LanguageModelUsage>;
  finalStep: PromiseLike<{ response: { modelId?: string } }>;
};

function toRequiredToken(value: number | undefined): bigint | null {
  return value === undefined || !Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0 ? null : BigInt(value);
}

function toOptionalToken(value: number | undefined): { valid: true; value: bigint | null } | { valid: false } {
  if (value === undefined) return { valid: true, value: null };
  const token = toRequiredToken(value);
  return token === null ? { valid: false } : { valid: true, value: token };
}

function normalize(usage: LanguageModelUsage): NormalizedUsage | null {
  const input = toRequiredToken(usage.inputTokens);
  const noCache = toRequiredToken(usage.inputTokenDetails.noCacheTokens);
  const cacheRead = toRequiredToken(usage.inputTokenDetails.cacheReadTokens);
  const cacheWrite = toRequiredToken(usage.inputTokenDetails.cacheWriteTokens ?? 0);
  const output = toRequiredToken(usage.outputTokens);
  if (input === null || noCache === null || cacheRead === null || cacheWrite === null || output === null) return null;
  const text = toOptionalToken(usage.outputTokenDetails.textTokens);
  const reasoning = toOptionalToken(usage.outputTokenDetails.reasoningTokens);
  const total = toOptionalToken(usage.totalTokens);
  if (!text.valid || !reasoning.valid || !total.valid) return null;
  return { inputTokens: input, inputTokensNoCache: noCache, inputTokensCacheRead: cacheRead, inputTokensCacheWrite: cacheWrite, outputTokens: output, outputTextTokens: text.value, outputReasoningTokens: reasoning.value, totalTokens: total.value };
}

export function observeTelemetry(result: StreamResult) {
  const usage = Promise.resolve(result.usage).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }));
  const step = Promise.resolve(result.finalStep).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }));
  return async function settle(timeoutMs = 2_000): Promise<{ usage: NormalizedUsage; effectiveModel: string | null } | { unavailableReason: string }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); });
    try {
      const settled = await Promise.race([Promise.all([usage, step]), timeout]);
      if (settled === "timeout") return { unavailableReason: "usage_timeout" };
      const [usageResult, stepResult] = settled;
      if (!usageResult.ok) return { unavailableReason: "usage_rejected" };
      const normalized = normalize(usageResult.value);
      if (!normalized) return { unavailableReason: "usage_invalid" };
      return { usage: normalized, effectiveModel: stepResult.ok ? stepResult.value.response.modelId ?? null : null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
