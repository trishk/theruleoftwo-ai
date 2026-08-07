import type { LLMRequest, LLMResponse } from "./types";

export async function askLLM(
  request: LLMRequest
): Promise<LLMResponse> {
  switch (request.provider) {
    case "openai":
      throw new Error("OpenAI provider not implemented");

    case "anthropic":
      throw new Error("Anthropic provider not implemented");

    case "google":
      throw new Error("Google provider not implemented");
  }
}