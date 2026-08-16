import { generateText, streamText } from "ai";

import { PROVIDERS } from "./providers";
import { PROVIDER_RUNNERS } from "./provider-runners";
import type {
  LLMRequest,
  LLMResponse,
} from "./types";

export async function askLLM(
  request: LLMRequest
): Promise<LLMResponse> {
  const startedAt = Date.now();

  const providerConfig =
    PROVIDERS[request.provider];

  const runner =
    PROVIDER_RUNNERS[request.provider];

  const model =
    request.model ??
    providerConfig.defaultModel;

  const result = await generateText({
    model: runner.createModel(
      model,
      request.apiKey
    ),
    instructions: request.instructions,
    messages: request.messages,
  });

  return {
    provider: request.provider,
    model,
    text: result.text,
    latencyMs: Date.now() - startedAt,
  };
}

export function streamLLM(
  request: LLMRequest,
  abortSignal?: AbortSignal

) {
  const providerConfig =
    PROVIDERS[request.provider];

  const runner =
    PROVIDER_RUNNERS[request.provider];

  const model =
    request.model ??
    providerConfig.defaultModel;

  return streamText({
    model: runner.createModel(
      model,
      request.apiKey
    ),
    instructions: request.instructions,
    messages: request.messages,
    abortSignal,
  });
}

