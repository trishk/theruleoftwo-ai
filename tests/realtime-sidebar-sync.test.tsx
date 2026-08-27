// @vitest-environment jsdom

import {
  act,
  render,
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

import { RealtimeSidebarSync } from "@/components/chat/realtime/RealtimeSidebarSync";

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
          conversationIds={[
            1, 2, 3, 4, 5,
          ]}
          activeConversationId={3}
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
        "conversation:1",
        "conversation:2",
        "conversation:4",
        "conversation:5",
      ]);
    });

    it("coalesces a burst from an inactive conversation into one active-page refresh", async () => {
      vi.useFakeTimers();

      render(
        <RealtimeSidebarSync
          conversationIds={[1, 2, 3]}
          activeConversationId={1}
        >
          <div>Child</div>
        </RealtimeSidebarSync>
      );

      const handlers =
        handlersByChannel.get(
          "conversation:2"
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
  }
);
