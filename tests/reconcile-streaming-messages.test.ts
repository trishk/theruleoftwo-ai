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

    it("reconciles a stopped partial response without displaying a duplicate", () => {
      const stoppedPartial = createStreamingMessage({
        content: "Partial response",
        isStreaming: false,
      });
      const persistedPartial = createPersistedMessage({
        content: "Partial response",
      });

      expect(reconcileStreamingMessages([stoppedPartial], [persistedPartial])).toEqual([]);
    });

    it("reconciles a persisted continuation of a stopped client partial", () => {
      const stoppedPartial = createStreamingMessage({
        content: "The answer is",
        isStopped: true,
      });
      const persistedContinuation = createPersistedMessage({
        content: "The answer is 4",
      });

      expect(
        reconcileStreamingMessages([stoppedPartial], [persistedContinuation])
      ).toEqual([]);
    });

    it("does not use one persisted continuation to reconcile two stopped rows", () => {
      const first = createStreamingMessage({
        id: -1,
        content: "The answer is",
        isStopped: true,
      });
      const second = createStreamingMessage({
        id: -2,
        content: "The answer is",
        isStopped: true,
      });
      const persisted = createPersistedMessage({
        content: "The answer is 4",
      });

      expect(reconcileStreamingMessages([first, second], [persisted])).toEqual([
        second,
      ]);
    });

    it("leaves no phantom row when the client saw no delta but persistence later arrives", () => {
      const persisted = createPersistedMessage({ content: "Already generated" });

      expect(reconcileStreamingMessages([], [persisted])).toEqual([]);
    });

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
