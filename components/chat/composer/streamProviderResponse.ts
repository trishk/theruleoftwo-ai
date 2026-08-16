import type {
  LLMStreamEvent,
  Provider,
} from "@/lib/llm/types";

type StreamProviderResponseArgs = {
  conversationId: number;
  messageId: number;
  provider: Provider;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onError: (code: LLMStreamEvent & { type: "error" }) => void;
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
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        messageId,
        provider,
      }),
      signal,
    }
  );

  if (response.status === 429) {
    const retryAfterSeconds = Number(
      response.headers.get("Retry-After") ?? "60"
    );

    throw new StreamRequestError(
      "Too many requests.",
      429,
      retryAfterSeconds
    );
  }

  if (!response.ok) {
    throw new StreamRequestError(
      `Streaming failed for ${provider}.`,
      response.status
    );
  }

  if (!response.body) {
    throw new Error(
      "Streaming response has no body."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let streamedText = "";

  while (true) {
    const { done, value } =
      await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const lines = buffer.split("\n");

    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = JSON.parse(
        line
      ) as LLMStreamEvent;

      if (event.type === "delta") {
        streamedText += event.text;
        onDelta(streamedText);
      }

      if (event.type === "error") {
        onError(event);
      }
    }
  }
}