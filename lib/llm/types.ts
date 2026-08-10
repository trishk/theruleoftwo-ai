export type Provider = "openai" | "anthropic" | "google";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  provider: Provider;
  model?: string;
  instructions?: string;
  messages: LLMMessage[];
}

export interface LLMResponse {
  provider: Provider;
  model: string;
  text: string;
  latencyMs: number;
}