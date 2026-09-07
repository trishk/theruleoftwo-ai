import type { ChatMessage } from "./types";

export function doesStreamingMessageMatchPersisted(
  streamingMessage: ChatMessage,
  persistedMessage: ChatMessage
) {
  return (
    persistedMessage.authorType === "ai" &&
    persistedMessage.provider ===
      streamingMessage.provider &&
    (persistedMessage.content ===
      streamingMessage.content ||
      Boolean(
        streamingMessage.isStopped &&
          streamingMessage.content.trim() &&
          persistedMessage.content.startsWith(
            streamingMessage.content
          )
      ))
  );
}
