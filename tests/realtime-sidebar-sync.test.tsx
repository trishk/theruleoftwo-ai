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

const {
  channelMock,
  removeChannelMock,
  refreshMock,
} = vi.hoisted(() => ({
  channelMock: vi.fn(),
  removeChannelMock: vi.fn(),
  refreshMock: vi.fn(),
}));

type EventHandlers = Map<
  string,
  () => void
>;

const handlersByChannel = new Map<
  string,
  EventHandlers
>();

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
  RealtimeSidebarSync,
  useSidebarRealtime,
} from "@/components/chat/realtime/RealtimeSidebarSync";

function TestConsumer() {
  const { broadcastConversationUpdated } =
    useSidebarRealtime();

  return (
    <button
      onClick={() =>
        void broadcastConversationUpdated(
          "chat-two"
        )
      }
    >
      Broadcast conversation
    </button>
  );
}

describe(
  "RealtimeSidebarSync performance baselines",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      handlersByChannel.clear();

      removeChannelMock.mockResolvedValue(
        "ok"
      );

      channelMock.mockImplementation(
        (topic: string) => {
          const handlers: EventHandlers =
            new Map();

          handlersByChannel.set(
            topic,
            handlers
          );

          const channel = {
            on: vi.fn(
              (
                _type: string,
                config: {
                  event: string;
                },
                callback: () => void
              ) => {
                handlers.set(
                  config.event,
                  callback
                );

                return channel;
              }
            ),
            subscribe: vi.fn(() =>
              channel
            ),
            send: vi.fn().mockResolvedValue(
              "ok"
            ),
          };

          return channel;
        }
      );
    });

    it("creates one channel for each inactive conversation", () => {
      render(
        <RealtimeSidebarSync
          conversationPublicIds={[
            "chat-one",
            "chat-two",
            "chat-three",
            "chat-four",
            "chat-five",
          ]}
          activeConversationPublicId="chat-three"
        >
          <div>Child</div>
        </RealtimeSidebarSync>
      );

      expect(channelMock).toHaveBeenCalledTimes(
        4
      );

      expect(
        channelMock.mock.calls.map(
          ([topic]) => topic
        )
      ).toEqual([
        "conversation:chat-one",
        "conversation:chat-two",
        "conversation:chat-four",
        "conversation:chat-five",
      ]);
    });

    it("coalesces a burst from an inactive conversation into one active-page refresh", async () => {
      vi.useFakeTimers();

      render(
        <RealtimeSidebarSync
          conversationPublicIds={[
            "chat-one",
            "chat-two",
            "chat-three",
          ]}
          activeConversationPublicId="chat-one"
        >
          <div>Child</div>
        </RealtimeSidebarSync>
      );

      const handlers =
        handlersByChannel.get(
          "conversation:chat-two"
        );

      handlers
        ?.get("message-created")
        ?.();
      handlers
        ?.get("message-created")
        ?.();
      handlers
        ?.get("conversation-updated")
        ?.();

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
    });

    it("selects sidebar broadcast channels by publicId and sends a content-free payload", async () => {
      render(
        <RealtimeSidebarSync
          conversationPublicIds={[
            "chat-one",
            "chat-two",
          ]}
          activeConversationPublicId="chat-one"
        >
          <TestConsumer />
        </RealtimeSidebarSync>
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Broadcast conversation",
        })
      );

      const channel = channelMock.mock.results[0]
        ?.value as {
        send: ReturnType<typeof vi.fn>;
      };

      await waitFor(() => {
        expect(channel.send).toHaveBeenCalledWith({
          type: "broadcast",
          event: "conversation-updated",
          payload: {},
        });
      });
    });

    it("removes every inactive channel on unmount", async () => {
      const { unmount } = render(
        <RealtimeSidebarSync
          conversationPublicIds={[
            "chat-one",
            "chat-two",
            "chat-three",
          ]}
          activeConversationPublicId="chat-one"
        >
          <div>Child</div>
        </RealtimeSidebarSync>
      );

      const inactiveChannels = channelMock.mock.results.map(
        ({ value }) => value
      );

      unmount();

      await waitFor(() => {
        expect(removeChannelMock).toHaveBeenCalledTimes(2);
      });

      expect(
        removeChannelMock.mock.calls.map(
          ([channel]) => channel
        )
      ).toEqual(inactiveChannels);
    });
  }
);
