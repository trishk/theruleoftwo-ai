import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import { PROVIDERS } from "./providers";
import type {
  LLMRequest,
  LLMResponse,
} from "./types";

export async function askOpenAI(
  request: LLMRequest
): Promise<LLMResponse> {
  const startedAt = Date.now();

  const result = await generateText({
    model: openai(PROVIDERS.openai.defaultModel),
    instructions: request.instructions,
    messages: request.messages,
  });

  return {
    provider: "openai",
    model: PROVIDERS.openai.defaultModel,
    text: result.text,
    latencyMs: Date.now() - startedAt,
  };
}