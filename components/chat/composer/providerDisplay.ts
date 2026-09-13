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

    case "agent_offline":
      return "The Personal Agent is offline.";
    case "chrome_unavailable":
      return "The Personal Agent cannot access Chrome.";
    case "sign_in_required":
      return "Gemini sign-in is required on the Personal Agent.";
    case "gemini_unavailable":
      return "Gemini is unavailable on the Personal Agent.";
    case "conversation_not_found":
      return "The Gemini conversation could not be found.";
    case "automation_changed":
      return "Gemini changed and the Personal Agent needs an update.";
    case "response_timeout_before_submit":
      return "The Personal Agent timed out before submitting to Gemini.";
    case "ambiguous_after_submit":
      return "Gemini may have received the request, so it was not retried. Resolve the Personal Agent state before continuing.";

    case "provider_error":
      return `${providerName} failed to respond. Please try again.`;
  }
}
