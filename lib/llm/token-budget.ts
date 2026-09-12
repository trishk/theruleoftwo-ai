import type { Provider } from "./types";

export type ModelTokenBudget = {
  contextWindowTokens: number;
  safetyMarginTokens: number;
  maxOutputTokens: number;
  maxInputTokens: number;
};

const MODEL_LIMITS: Record<Provider, Record<string, Omit<ModelTokenBudget, "maxInputTokens">>> = {
  openai: {
    "gpt-5-mini": { contextWindowTokens: 128_000, safetyMarginTokens: 8_000, maxOutputTokens: 8_192 },
    "gpt-5": { contextWindowTokens: 128_000, safetyMarginTokens: 8_000, maxOutputTokens: 8_192 },
  },
  anthropic: {
    "claude-haiku-4-5": { contextWindowTokens: 200_000, safetyMarginTokens: 12_000, maxOutputTokens: 8_192 },
    "claude-sonnet-4-5": { contextWindowTokens: 200_000, safetyMarginTokens: 12_000, maxOutputTokens: 8_192 },
  },
  google: {
    "gemini-3.6-flash": { contextWindowTokens: 128_000, safetyMarginTokens: 8_000, maxOutputTokens: 8_192 },
  },
};

export function getModelTokenBudget(provider: Provider, model: string): ModelTokenBudget {
  const configured = MODEL_LIMITS[provider][model];
  if (!configured) throw new Error(`No token budget configured for ${provider}/${model}.`);
  return {
    ...configured,
    maxInputTokens:
      configured.contextWindowTokens - configured.safetyMarginTokens - configured.maxOutputTokens,
  };
}

// Conservative shared v1 estimator: byte-fallback tokenizers cannot produce more
// tokens than UTF-8 bytes. The fixed allowance covers message-role/SDK framing.
export function estimateRequestTokens(instructions: string, serializedUserMessage: string) {
  return Buffer.byteLength(instructions, "utf8") + Buffer.byteLength(serializedUserMessage, "utf8") + 256;
}
