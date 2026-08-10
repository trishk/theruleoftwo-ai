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

  const model =
    request.model ?? PROVIDERS.anthropic.defaultModel;

  const result = await generateText({
    model: anthropic(model),
    instructions: request.instructions,
    messages: request.messages,
  });

  return {
    provider: "anthropic",
    model,
    text: result.text,
    latencyMs: Date.now() - startedAt,
  };
}