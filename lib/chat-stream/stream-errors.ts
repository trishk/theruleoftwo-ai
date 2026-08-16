import type {
  LLMStreamErrorCode,
} from "@/lib/llm/types";

export function getStreamErrorCode(
  error: unknown
): LLMStreamErrorCode {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes("credit") ||
    message.includes("quota") ||
    message.includes("billing")
  ) {
    return "insufficient_credits";
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return "rate_limit";
  }

  if (
    message.includes("api key") ||
    message.includes("unauthorized") ||
    message.includes("401")
  ) {
    return "invalid_api_key";
  }

  return "provider_error";
}