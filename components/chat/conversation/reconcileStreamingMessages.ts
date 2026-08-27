import type { ChatMessage } from "./types";

export function isStreamingMessagePersisted(
  streamingMessage: ChatMessage,
  persistedMessages: ChatMessage[]
) {
  return persistedMessages.some(
    (persistedMessage) =>
      persistedMessage.authorType === "ai" &&
      persistedMessage.authorName ===
        streamingMessage.authorName &&
      persistedMessage.content ===
        streamingMessage.content
  );
}

export function reconcileStreamingMessages(
  streamingMessages: ChatMessage[],
  persistedMessages: ChatMessage[]
) {
  return streamingMessages.filter(
    (streamingMessage) =>
      !isStreamingMessagePersisted(
        streamingMessage,
        persistedMessages
      )
  );
}