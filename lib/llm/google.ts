import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { PROVIDERS } from "./providers";
import type { LLMRequest, LLMResponse } from "./types";

export async function askGoogle(
  request: LLMRequest
): Promise<LLMResponse> {
  const startedAt = Date.now();

  const model =
    request.model ?? PROVIDERS.google.defaultModel;

  const google = createGoogleGenerativeAI(
    request.apiKey
      ? {
          apiKey: request.apiKey,
        }
      : {}
  );

  const result = await generateText({
    model: google(model),
    instructions: request.instructions,
    messages: request.messages,
  });

  return {
    provider: "google",
    model,
    text: result.text,
    latencyMs: Date.now() - startedAt,
  };
}