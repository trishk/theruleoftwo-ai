export type Provider = "openai" | "anthropic" | "google";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  provider: Provider;
  messages: LLMMessage[];
}

export interface LLMResponse {
  provider: Provider;
  model: string;
  text: string;
  latencyMs: number;
}