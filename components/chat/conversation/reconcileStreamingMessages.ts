import type { ChatMessage } from "./types";

export function doesStreamingMessageMatchPersisted(
  streamingMessage: ChatMessage,
  persistedMessage: ChatMessage
) {
  if (streamingMessage.attemptId && persistedMessage.attemptId) {
    return streamingMessage.attemptId === persistedMessage.attemptId;
  }
  if (streamingMessage.outputMessageId && persistedMessage.id > 0) {
    return streamingMessage.outputMessageId === persistedMessage.id;
  }
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
