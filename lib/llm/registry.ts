import { askOpenAI } from "./openai";
import { askAnthropic } from "./anthropic";
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
      return {
        provider: "google",
        model: "",
        text: "Gemini integration is not implemented yet.",
        latencyMs: 0,
      };
  }
}