import "server-only";

const CHUNKS = [
  "Deterministic ",
  "E2E response ",
  "from TheRuleOfTwo.ai.",
] as const;

const CHUNK_DELAYS_MS = [350, 2_500, 350] as const;

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

export function createDeterministicE2EStream(
  abortSignal?: AbortSignal
) {
  return {
    textStream: {
      async *[Symbol.asyncIterator]() {
        for (const [index, chunk] of CHUNKS.entries()) {
          await wait(CHUNK_DELAYS_MS[index], abortSignal);
          yield chunk;
        }
      },
    },
    usage: Promise.resolve({
      inputTokens: 3,
      inputTokenDetails: {
        noCacheTokens: 3,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokens: 6,
      outputTokenDetails: {
        textTokens: 6,
        reasoningTokens: 0,
      },
      totalTokens: 9,
    }),
    finalStep: Promise.resolve({
      response: { modelId: "e2e-deterministic" },
    }),
  };
}

export const E2E_RESPONSE_TEXT = CHUNKS.join("");

export function createDeterministicE2EResponse(
  provider: "openai" | "anthropic" | "google"
) {
  return {
    provider,
    model: "e2e-deterministic",
    text: E2E_RESPONSE_TEXT,
    latencyMs: 0,
  };
}
