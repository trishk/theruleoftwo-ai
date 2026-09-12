export type Provider = "openai" | "anthropic" | "google";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  provider: Provider;
  model?: string;
  apiKey?: string;
  instructions?: string;
  messages: LLMMessage[];
  maxOutputTokens: number;
}

export interface LLMResponse {
  provider: Provider;
  model: string;
  text: string;
  latencyMs: number;
}

export type LLMStreamErrorCode =
  | "insufficient_credits"
  | "rate_limit"
  | "invalid_api_key"
  | "provider_error";

export type LLMStreamEvent =
  | {
      type: "generation";
      outcome: "started";
      generationId: string;
      attemptId: string;
      messageId: number;
    }
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "error";
      code: LLMStreamErrorCode;
    }
  | {
      type: "done";
    };
