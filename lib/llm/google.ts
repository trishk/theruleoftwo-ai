import { generateText } from "ai";
import { google } from "@ai-sdk/google";

import { PROVIDERS } from "./providers";
import type {
  LLMRequest,
  LLMResponse,
} from "./types";

export async function askGoogle(
  request: LLMRequest
): Promise<LLMResponse> {
  const startedAt = Date.now();

  const result = await generateText({
  model: google(PROVIDERS.google.defaultModel),
  instructions: request.instructions,
  messages: request.messages,
});

  return {
    provider: "google",
    model: PROVIDERS.google.defaultModel,
    text: result.text,
    latencyMs: Date.now() - startedAt,
  };
}