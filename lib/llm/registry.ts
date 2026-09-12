import "server-only";
import { generateText, streamText } from "ai";

import { PROVIDERS } from "./providers";
import { PROVIDER_RUNNERS } from "./provider-runners";
import type {
  LLMRequest,
  LLMResponse,
} from "./types";
import { isSafeE2EMode } from "./e2e-mode";
import {
  createDeterministicE2EResponse,
  createDeterministicE2EStream,
} from "./e2e-stream";

export async function askLLM(
  request: LLMRequest
): Promise<LLMResponse> {
  if (isSafeE2EMode()) {
    return createDeterministicE2EResponse(request.provider);
  }

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
    maxOutputTokens: request.maxOutputTokens,
    maxRetries: 0,
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
  if (isSafeE2EMode()) {
    return createDeterministicE2EStream(abortSignal);
  }

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
    maxOutputTokens: request.maxOutputTokens,
    abortSignal,
    maxRetries: 0,
  });
}

