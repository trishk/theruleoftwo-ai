// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import "@testing-library/jest-dom/vitest";

const {
  channelMock,
  onMock,
  subscribeMock,
  sendMock,
  removeChannelMock,
  refreshMock,
} = vi.hoisted(() => ({
  channelMock: vi.fn(),
  onMock: vi.fn(),
  subscribeMock: vi.fn(),
  sendMock: vi.fn(),
  removeChannelMock: vi.fn(),
  refreshMock: vi.fn(),
}));

let subscriptionCallback:
  | ((
      status: string,
      error?: Error
    ) => void)
  | undefined;

const eventHandlers =
  new Map<string, () => void>();

vi.mock(
  "@/lib/supabase/client",
  () => ({
    createClient: () => ({
      channel: channelMock,
      removeChannel:
        removeChannelMock,
    }),
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

import {
  RealtimeConversationSync,
  useConversationRealtime,
} from "@/components/chat/realtime/RealtimeConversationSync";

function TestConsumer() {
  const {
    broadcastMessageCreated,
    broadcastConversationUpdated,
    isReady,
  } =
    useConversationRealtime();

  return (
    <>
      <div data-testid="ready">
        {isReady
          ? "ready"
          : "not-ready"}
      </div>

      <button
        onClick={() =>
          void broadcastMessageCreated()
        }
      >
        Broadcast message
      </button>

      <button
        onClick={() =>
          void broadcastConversationUpdated()
        }
      >
        Broadcast conversation
      </button>
    </>
  );
}

describe(
  "RealtimeConversationSync",
  () => {
    const fakeChannel = {
      on: onMock,
      subscribe:
        subscribeMock,
      send: sendMock,
    };

    beforeEach(() => {
      vi.clearAllMocks();

      eventHandlers.clear();

      subscriptionCallback =
        undefined;

      onMock.mockImplementation(
        (
          _type: string,
          config: {
            event: string;
          },
          callback: () => void
        ) => {
          eventHandlers.set(
            config.event,
            callback
          );

          return fakeChannel;
        }
      );

      subscribeMock.mockImplementation(
        (
          callback: (
            status: string,
            error?: Error
          ) => void
        ) => {
          subscriptionCallback =
            callback;

          return fakeChannel;
        }
      );

      sendMock.mockResolvedValue(
        "ok"
      );

      removeChannelMock.mockResolvedValue(
        "ok"
      );

      channelMock.mockReturnValue(
        fakeChannel
      );
    });

    it(
      "subscribes to the correct conversation channel",
      () => {
        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        expect(
          channelMock
        ).toHaveBeenCalledWith(
          "conversation:chat-public-id"
        );

        expect(
          onMock
        ).toHaveBeenCalledWith(
          "broadcast",
          {
            event:
              "message-created",
          },
          expect.any(Function)
        );

        expect(
          onMock
        ).toHaveBeenCalledWith(
          "broadcast",
          {
            event:
              "conversation-updated",
          },
          expect.any(Function)
        );

        expect(
          subscribeMock
        ).toHaveBeenCalled();
      }
    );

    it(
      "becomes ready after Supabase reports SUBSCRIBED",
      async () => {
        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        expect(
          screen.getByTestId(
            "ready"
          )
        ).toHaveTextContent(
          "not-ready"
        );

        await act(
          async () => {
            subscriptionCallback?.(
              "SUBSCRIBED"
            );
          }
        );

        await waitFor(() => {
          expect(
            screen.getByTestId(
              "ready"
            )
          ).toHaveTextContent(
            "ready"
          );
        });
      }
    );

    it(
      "refreshes when a message-created broadcast is received",
      async () => {
        vi.useFakeTimers();

        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        eventHandlers
          .get(
            "message-created"
          )
          ?.();

        expect(
          refreshMock
        ).not.toHaveBeenCalled();

        await act(async () => {
          vi.advanceTimersByTime(25);
        });

        expect(
          refreshMock
        ).toHaveBeenCalledTimes(
          1
        );

        vi.useRealTimers();
      }
    );

    it(
      "refreshes when a conversation-updated broadcast is received",
      async () => {
        vi.useFakeTimers();

        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        eventHandlers
          .get(
            "conversation-updated"
          )
          ?.();

        await act(async () => {
          vi.advanceTimersByTime(25);
        });

        expect(
          refreshMock
        ).toHaveBeenCalledTimes(
          1
        );

        vi.useRealTimers();
      }
    );

    it(
      "coalesces multiple realtime events within a short window into at most one refresh",
      async () => {
        vi.useFakeTimers();

        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        const messageCreated =
          eventHandlers.get(
            "message-created"
          );

        const conversationUpdated =
          eventHandlers.get(
            "conversation-updated"
          );

        messageCreated?.();
        messageCreated?.();
        conversationUpdated?.();
        messageCreated?.();
        conversationUpdated?.();

        expect(
          refreshMock
        ).not.toHaveBeenCalled();

        await act(async () => {
          vi.advanceTimersByTime(25);
        });

        expect(
          refreshMock
        ).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
      }
    );

    it(
      "broadcasts message-created",
      async () => {
        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Broadcast message",
            }
          )
        );

        await waitFor(() => {
          expect(
            sendMock
          ).toHaveBeenCalledWith({
            type:
              "broadcast",
            event:
              "message-created",
            payload: {},
          });
        });
      }
    );

    it(
      "broadcasts conversation-updated",
      async () => {
        render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Broadcast conversation",
            }
          )
        );

        await waitFor(() => {
          expect(
            sendMock
          ).toHaveBeenCalledWith({
            type:
              "broadcast",
            event:
              "conversation-updated",
            payload: {},
          });
        });
      }
    );

    it(
      "removes the realtime channel on unmount",
      async () => {
        const {
          unmount,
        } = render(
          <RealtimeConversationSync
            conversationPublicId="chat-public-id"
          >
            <TestConsumer />
          </RealtimeConversationSync>
        );

        unmount();

        await waitFor(() => {
          expect(
            removeChannelMock
          ).toHaveBeenCalledWith(
            fakeChannel
          );
        });
      }
    );
  }
);
