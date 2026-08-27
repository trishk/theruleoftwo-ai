// @vitest-environment jsdom

import {
  act,
  renderHook,
} from "@testing-library/react";
import { useState } from "react";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ChatMessage } from "@/components/chat/conversation/types";

const {
  sendHumanMessageMock,
  generateProvidersMock,
  retryProviderMock,
  stopGenerationMock,
  refreshMock,
  broadcastMessageCreatedMock,
} = vi.hoisted(() => ({
  sendHumanMessageMock: vi.fn(),
  generateProvidersMock: vi.fn(),
  retryProviderMock: vi.fn(),
  stopGenerationMock: vi.fn(),
  refreshMock: vi.fn(),
  broadcastMessageCreatedMock:
    vi.fn(),
}));

vi.mock(
  "@/app/actions",
  () => ({
    sendHumanMessage:
      sendHumanMessageMock,
  })
);

vi.mock(
  "next/navigation",
  () => ({
    useRouter: () => ({
      refresh: refreshMock,
    }),
  })
);

vi.mock(
  "@/components/chat/realtime/RealtimeConversationSync",
  () => ({
    useConversationRealtime:
      () => ({
        broadcastMessageCreated:
          broadcastMessageCreatedMock,
        isReady: true,
      }),
  })
);

vi.mock(
  "@/components/chat/composer/useProviderGeneration",
  () => ({
    useProviderGeneration:
      () => ({
        generateProviders:
          generateProvidersMock,
        retryProvider:
          retryProviderMock,
        stopGeneration:
          stopGenerationMock,
      }),
  })
);

import { useMessageComposer } from "@/components/chat/composer/useMessageComposer";

function createDeferred<T>() {
  let resolve!: (
    value: T | PromiseLike<T>
  ) => void;

  const promise = new Promise<T>(
    (resolvePromise) => {
      resolve = resolvePromise;
    }
  );

  return {
    promise,
    resolve,
  };
}

function useTestHarness() {
  const [
    optimisticMessages,
    setOptimisticMessages,
  ] = useState<ChatMessage[]>([]);

  const [
    streamingMessages,
    setStreamingMessages,
  ] = useState<ChatMessage[]>([]);

  const composer =
    useMessageComposer({
      conversationId: 42,
      replyTo: null,
      onCancelReply:
        vi.fn(),
      onOptimisticMessagesChange:
        setOptimisticMessages,
      onStreamingMessagesChange:
        setStreamingMessages,
      onSubmitAccepted: vi.fn(),
    });

  return {
    ...composer,
    optimisticMessages,
    streamingMessages,
  };
}

describe(
  "useMessageComposer",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      sendHumanMessageMock.mockResolvedValue(
        {
          messageId: 100,
          providers: [
            "openai",
          ],
        }
      );

      generateProvidersMock.mockResolvedValue(
        undefined
      );

      broadcastMessageCreatedMock.mockResolvedValue(
        undefined
      );
    });

    it(
      "creates the human message optimistically before persistence completes",
      async () => {
        let resolveSend:
          | ((
              value: {
                messageId: number;
                providers: [
                  "openai"
                ];
              }
            ) => void)
          | undefined;

        sendHumanMessageMock.mockReturnValue(
          new Promise((resolve) => {
            resolveSend = resolve;
          })
        );

        const { result } =
          renderHook(() =>
            useTestHarness()
          );

        act(() => {
          result.current.setMessage(
            "@chatgpt hello"
          );
        });

        let submitPromise:
          | Promise<void>
          | undefined;

        act(() => {
          submitPromise =
            result.current.submitMessage();
        });

        expect(
          result.current.optimisticMessages
        ).toHaveLength(1);

        expect(
          result.current.optimisticMessages[0]
        ).toMatchObject({
          authorType: "human",
          content:
            "@chatgpt hello",
          isOwnMessage: true,
        });

        await act(async () => {
          resolveSend?.({
            messageId: 100,
            providers: [
              "openai",
            ],
          });

          await submitPromise;
        });
      }
    );

    it(
      "refreshes the sender exactly once after generation and before the final peer broadcast",
      async () => {
        const { result } =
          renderHook(() =>
            useTestHarness()
          );

        act(() => {
          result.current.setMessage(
            "@chatgpt hello"
          );
        });

        await act(async () => {
          await result.current.submitMessage();
        });

        expect(
          sendHumanMessageMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          generateProvidersMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          refreshMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          broadcastMessageCreatedMock
        ).toHaveBeenCalledTimes(2);

        expect(
          broadcastMessageCreatedMock.mock
            .invocationCallOrder[0]
        ).toBeLessThan(
          generateProvidersMock.mock
            .invocationCallOrder[0]
        );

        expect(
          generateProvidersMock.mock
            .invocationCallOrder[0]
        ).toBeLessThan(
          refreshMock.mock
            .invocationCallOrder[0]
        );

        expect(
          refreshMock.mock
            .invocationCallOrder[0]
        ).toBeLessThan(
          broadcastMessageCreatedMock.mock
            .invocationCallOrder[1]
        );
      }
    );

    it(
      "does not refresh after persistence while provider generation is still pending",
      async () => {
        const pendingGeneration =
          createDeferred<void>();

        generateProvidersMock.mockReturnValue(
          pendingGeneration.promise
        );

        const { result } =
          renderHook(() =>
            useTestHarness()
          );

        act(() => {
          result.current.setMessage(
            "@chatgpt hello"
          );
        });

        let submitPromise:
          | Promise<void>
          | undefined;

        act(() => {
          submitPromise =
            result.current.submitMessage();
        });

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(
          sendHumanMessageMock
        ).toHaveBeenCalledTimes(1);

        expect(
          generateProvidersMock
        ).toHaveBeenCalledTimes(1);

        expect(
          refreshMock
        ).not.toHaveBeenCalled();

        expect(
          broadcastMessageCreatedMock
        ).toHaveBeenCalledTimes(1);

        await act(async () => {
          pendingGeneration.resolve();
          await submitPromise;
        });

        expect(
          refreshMock
        ).toHaveBeenCalledTimes(1);

        expect(
          broadcastMessageCreatedMock
        ).toHaveBeenCalledTimes(2);
      }
    );

    it(
      "starts accepted generation after persistence resolves even when the conversation session unmounted",
      async () => {
        const pendingSend =
          createDeferred<{
            messageId: number;
            providers: [
              "openai",
              "anthropic",
              "google",
            ];
          }>();

        sendHumanMessageMock.mockReturnValue(
          pendingSend.promise
        );

        const {
          result,
          unmount,
        } = renderHook(() =>
          useTestHarness()
        );

        act(() => {
          result.current.setMessage(
            "@chatgpt @claude @gemini hello"
          );
        });

        let submitPromise:
          | Promise<void>
          | undefined;

        act(() => {
          submitPromise =
            result.current.submitMessage();
        });

        unmount();

        await act(async () => {
          pendingSend.resolve({
            messageId: 321,
            providers: [
              "openai",
              "anthropic",
              "google",
            ],
          });

          await submitPromise;
        });

        expect(
          sendHumanMessageMock
        ).toHaveBeenCalledWith(
          42,
          "@chatgpt @claude @gemini hello",
          null
        );

        expect(
          generateProvidersMock
        ).toHaveBeenCalledTimes(1);

        expect(
          generateProvidersMock
        ).toHaveBeenCalledWith(
          [
            "openai",
            "anthropic",
            "google",
          ],
          321
        );

        expect(
          refreshMock
        ).not.toHaveBeenCalled();

        expect(
          broadcastMessageCreatedMock
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "refreshes locally once after a provider retry and then broadcasts to peers",
      async () => {
        const { result } =
          renderHook(() =>
            useTestHarness()
          );

        await act(async () => {
          await result.current.retryProvider(
            "openai",
            100,
            -1
          );
        });

        expect(
          retryProviderMock
        ).toHaveBeenCalledTimes(1);

        expect(
          refreshMock
        ).toHaveBeenCalledTimes(1);

        expect(
          broadcastMessageCreatedMock
        ).toHaveBeenCalledTimes(1);

        expect(
          refreshMock.mock
            .invocationCallOrder[0]
        ).toBeLessThan(
          broadcastMessageCreatedMock.mock
            .invocationCallOrder[0]
        );
      }
    );
  }
);
