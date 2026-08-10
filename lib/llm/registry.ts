import { askOpenAI } from "./openai";
import { askAnthropic } from "./anthropic";
import { askGoogle } from "./google";
import type { LLMRequest, LLMResponse } from "./types";

export async function askLLM(
  request: LLMRequest
): Promise<LLMResponse> {
  switch (request.provider) {
    case "openai":
      return askOpenAI(request);

    case "anthropic":
      return askAnthropic(request);

    case "google":
      return askGoogle(request);
  }
}