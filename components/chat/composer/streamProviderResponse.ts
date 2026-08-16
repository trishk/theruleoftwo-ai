import type {
  LLMStreamEvent,
  Provider,
} from "@/lib/llm/types";

const DEFAULT_RETRY_AFTER_SECONDS = 60;

type StreamProviderResponseArgs = {
  conversationId: number;
  messageId: number;
  provider: Provider;
  signal: AbortSignal;
  onDelta: (streamedText: string) => void;
  onError: (
    event: Extract<
      LLMStreamEvent,
      { type: "error" }
    >
  ) => void;
};

export class StreamRequestError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    retryAfterSeconds?: number
  ) {
    super(message);

    this.name = "StreamRequestError";
    this.status = status;
    this.retryAfterSeconds =
      retryAfterSeconds;
  }
}

function getRetryAfterSeconds(
  response: Response
) {
  const retryAfterHeader =
    response.headers.get("Retry-After");

  if (!retryAfterHeader) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  const parsedRetryAfter =
    Number(retryAfterHeader);

  if (
    !Number.isFinite(parsedRetryAfter) ||
    parsedRetryAfter <= 0
  ) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  return parsedRetryAfter;
}

export async function streamProviderResponse({
  conversationId,
  messageId,
  provider,
  signal,
  onDelta,
  onError,
}: StreamProviderResponseArgs) {
  const response = await fetch(
    "/api/chat/stream",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        conversationId,
        messageId,
        provider,
      }),
      signal,
    }
  );

  if (!response.ok) {
    const retryAfterSeconds =
      response.status === 429
        ? getRetryAfterSeconds(response)
        : undefined;

    throw new StreamRequestError(
      `Streaming failed for ${provider}.`,
      response.status,
      retryAfterSeconds
    );
  }

  if (!response.body) {
    throw new StreamRequestError(
      "Streaming response has no body.",
      response.status
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let streamedText = "";
  let buffer = "";

  while (true) {
    const { done, value } =
      await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(
      value,
      {
        stream: true,
      }
    );

    const lines =
      buffer.split("\n");

    buffer =
      lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event =
        JSON.parse(
          line
        ) as LLMStreamEvent;

      if (
        event.type === "delta"
      ) {
        streamedText +=
          event.text;

        onDelta(
          streamedText
        );
      }

      if (
        event.type === "error"
      ) {
        onError(event);
      }
    }
  }
}