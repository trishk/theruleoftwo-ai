import type { ChatMessage } from "./types";

export function isStreamingMessagePersisted(
  streamingMessage: ChatMessage,
  persistedMessages: ChatMessage[]
) {
  return persistedMessages.some(
    (persistedMessage) =>
      persistedMessage.authorType === "ai" &&
      persistedMessage.provider ===
        streamingMessage.provider &&
      persistedMessage.content ===
        streamingMessage.content
  );
}

export function reconcileStreamingMessages(
  streamingMessages: ChatMessage[],
  persistedMessages: ChatMessage[]
) {
  const availablePersistedIndexes =
    new Set(
      persistedMessages.map(
        (_, index) => index
      )
    );

  return streamingMessages.filter(
    (streamingMessage) => {
      const matchIndex =
        persistedMessages.findIndex(
          (persistedMessage, index) =>
            availablePersistedIndexes.has(
              index
            ) &&
            persistedMessage.authorType ===
              "ai" &&
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

      if (matchIndex === -1) {
        return true;
      }

      availablePersistedIndexes.delete(
        matchIndex
      );

      return false;
    }
  );
}
