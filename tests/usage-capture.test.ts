import { describe, expect, it, vi } from "vitest";
import { observeTelemetry } from "@/lib/llm/usage/capture";

const validUsage = { inputTokens: 3, inputTokenDetails: { noCacheTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 }, outputTokens: 2, outputTokenDetails: { textTokens: 1, reasoningTokens: 1 }, totalTokens: 5 };

describe("usage capture", () => {
  it("captures normalized usage and provider model", async () => {
    const settle = observeTelemetry({ usage: Promise.resolve(validUsage), finalStep: Promise.resolve({ response: { modelId: "gpt-5" } }) });
    await expect(settle()).resolves.toMatchObject({ usage: { inputTokens: 3n, outputTokens: 2n }, effectiveModel: "gpt-5" });
  });
  it("converts a rejected usage promise to a controlled reason", async () => {
    const settle = observeTelemetry({ usage: Promise.reject(new Error("private provider error")), finalStep: Promise.reject(new Error("private provider error")) });
    await expect(settle()).resolves.toEqual({ unavailableReason: "usage_rejected" });
  });
  it("times out and clears its timer", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<never>(() => undefined);
      const settle = observeTelemetry({ usage: never, finalStep: never });
      const result = settle(25);
      await vi.advanceTimersByTimeAsync(25);
      await expect(result).resolves.toEqual({ unavailableReason: "usage_timeout" });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it.each([
    ["negative reasoning", { outputTokenDetails: { textTokens: 1, reasoningTokens: -1 } }],
    ["non-finite text", { outputTokenDetails: { textTokens: Number.NaN, reasoningTokens: 1 } }],
    ["fractional total", { totalTokens: 1.5 }],
    ["unsafe total", { totalTokens: Number.MAX_SAFE_INTEGER + 1 }],
  ])("rejects present invalid optional usage: %s", async (_name, override) => {
    const usage = { ...validUsage, ...override };
    const settle = observeTelemetry({ usage: Promise.resolve(usage), finalStep: Promise.resolve({ response: {} }) });
    await expect(settle()).resolves.toEqual({ unavailableReason: "usage_invalid" });
  });

  it("accepts absent optional output details and total", async () => {
    const usage = { ...validUsage, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined }, totalTokens: undefined };
    const settle = observeTelemetry({ usage: Promise.resolve(usage), finalStep: Promise.resolve({ response: {} }) });
    await expect(settle()).resolves.toMatchObject({ usage: { outputTextTokens: null, outputReasoningTokens: null, totalTokens: null } });
  });
});
