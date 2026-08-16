import type {
  LLMStreamErrorCode,
  Provider,
} from "@/lib/llm/types";

export function getProviderDisplayName(
  provider: Provider
) {
  switch (provider) {
    case "openai":
      return "ChatGPT";

    case "anthropic":
      return "Claude";

    case "google":
      return "Gemini";
  }
}

export function getProviderErrorMessage(
  provider: Provider,
  code: LLMStreamErrorCode
) {
  const providerName =
    getProviderDisplayName(provider);

  switch (code) {
    case "insufficient_credits":
      return `${providerName} has no remaining credits.`;

    case "rate_limit":
      return `${providerName} rate limit reached. Please try again shortly.`;

    case "invalid_api_key":
      return `${providerName} API key is invalid or unauthorized.`;

    case "provider_error":
      return `${providerName} failed to respond. Please try again.`;
  }
}