import { askOpenAI } from "./openai";
import type { LLMRequest, LLMResponse } from "./types";

export async function askLLM(
  request: LLMRequest
): Promise<LLMResponse> {
  switch (request.provider) {
    case "openai":
      return askOpenAI(request);

    case "anthropic":
      return {
        provider: "anthropic",
        model: "",
        text: "Claude integration is not implemented yet.",
        latencyMs: 0,
      };

    case "google":
      return {
        provider: "google",
        model: "",
        text: "Gemini integration is not implemented yet.",
        latencyMs: 0,
      };
  }
}