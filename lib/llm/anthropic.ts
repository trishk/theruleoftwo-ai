import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import { PROVIDERS } from "./providers";
import type {
  LLMRequest,
  LLMResponse,
} from "./types";

export async function askAnthropic(
  request: LLMRequest
): Promise<LLMResponse> {
  const startedAt = Date.now();

  const result = await generateText({
    model: anthropic(PROVIDERS.anthropic.defaultModel),
    messages: request.messages,
  });

  return {
    provider: "anthropic",
    model: PROVIDERS.anthropic.defaultModel,
    text: result.text,
    latencyMs: Date.now() - startedAt,
  };
}