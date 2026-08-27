import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStreamingMessagePersisted,
  reconcileStreamingMessages,
} from "@/components/chat/conversation/reconcileStreamingMessages";

import type { ChatMessage } from "@/components/chat/conversation/types";

function createStreamingMessage(
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: -1,
    authorType: "ai",
    authorName: "ChatGPT",
    content: "Mocked LLM response",
    createdAt: new Date(
      "2026-08-26T09:00:00Z"
    ),
    isOwnMessage: false,
    isStreaming: false,
    isError: false,
    provider: "openai",
    sourceMessageId: 100,
    replyTo: null,
    ...overrides,
  };
}

function createPersistedMessage(
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: 200,
    authorType: "ai",
    authorName: "ChatGPT",
    content: "Mocked LLM response",
    createdAt: new Date(
      "2026-08-26T09:00:01Z"
    ),
    isOwnMessage: false,
    isStreaming: false,
    isError: false,
    provider: "openai",
    sourceMessageId: 100,
    replyTo: null,
    ...overrides,
  };
}

describe(
  "reconcileStreamingMessages",
  () => {
    it(
      "keeps a completed streaming message while no persisted equivalent exists",
      () => {
        const streamingMessage =
          createStreamingMessage();

        const result =
          reconcileStreamingMessages(
            [streamingMessage],
            []
          );

        expect(result).toEqual([
          streamingMessage,
        ]);
      }
    );

    it(
      "removes a streaming message when its persisted equivalent exists",
      () => {
        const streamingMessage =
          createStreamingMessage();

        const persistedMessage =
          createPersistedMessage();

        expect(
          isStreamingMessagePersisted(
            streamingMessage,
            [persistedMessage]
          )
        ).toBe(true);

        const result =
          reconcileStreamingMessages(
            [streamingMessage],
            [persistedMessage]
          );

        expect(result).toEqual([]);
      }
    );

    it(
      "does not reconcile messages with different content",
      () => {
        const streamingMessage =
          createStreamingMessage();

        const persistedMessage =
          createPersistedMessage({
            content:
              "A different response",
          });

        const result =
          reconcileStreamingMessages(
            [streamingMessage],
            [persistedMessage]
          );

        expect(result).toEqual([
          streamingMessage,
        ]);
      }
    );

    it(
      "does not reconcile messages from different AI authors",
      () => {
        const streamingMessage =
          createStreamingMessage();

        const persistedMessage =
          createPersistedMessage({
            authorName: "Claude",
            provider: "anthropic",
          });

        const result =
          reconcileStreamingMessages(
            [streamingMessage],
            [persistedMessage]
          );

        expect(result).toEqual([
          streamingMessage,
        ]);
      }
    );
  }
);