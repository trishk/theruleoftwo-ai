// @vitest-environment jsdom

import {
  render,
  type RenderResult,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ChatMessage } from "@/components/chat/conversation/types";

const { messageItemRenderSpy } =
  vi.hoisted(() => ({
    messageItemRenderSpy: vi.fn(),
  }));

vi.mock(
  "@/components/chat/conversation/MessageItem",
  () => ({
    MessageItem: (props: {
      authorName: string;
      content: string;
    }) => {
      messageItemRenderSpy(props);

      return (
        <div data-testid={props.authorName}>
          {props.content}
        </div>
      );
    },
  })
);

import { MessageList } from "@/components/chat/conversation/MessageList";

const noop = () => {};

let animationFrameCallbacks: Array<
  FrameRequestCallback
> = [];

function flushAnimationFrames() {
  const callbacks = [
    ...animationFrameCallbacks,
  ];

  animationFrameCallbacks = [];

  callbacks.forEach((callback) =>
    callback(0)
  );
}

function createHistoricMessages() {
  return Array.from(
    { length: 50 },
    (_, index): ChatMessage => ({
      id: index + 1,
      authorType: "human",
      authorName: `Historic ${index + 1}`,
      content: `Message ${index + 1}`,
      createdAt: new Date(0),
      isOwnMessage: false,
    })
  );
}

function renderMessageList(
  messages: ChatMessage[],
  existingRender?: RenderResult
) {
  const element = (
    <MessageList
      messages={messages}
      onReply={noop}
      onRetry={noop}
    />
  );

  if (existingRender) {
    existingRender.rerender(element);
    return existingRender;
  }

  return render(element);
}

describe(
  "MessageList performance baselines",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      Object.defineProperty(
        HTMLElement.prototype,
        "scrollTo",
        {
          configurable: true,
          value: vi.fn(),
        }
      );

      animationFrameCallbacks = [];

      vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((callback: FrameRequestCallback) => {
          animationFrameCallbacks.push(
            callback
          );

          return animationFrameCallbacks.length;
        })
      );

      vi.stubGlobal(
        "cancelAnimationFrame",
        vi.fn()
      );
    });

    it("does not rerender unchanged historic rows for streaming message updates", () => {
      const historicMessages =
        createHistoricMessages();

      const streamingBase: ChatMessage = {
        id: -1,
        authorType: "ai",
        authorName: "ChatGPT",
        content: "",
        createdAt: new Date(0),
        isOwnMessage: false,
        isStreaming: true,
        provider: "openai",
        sourceMessageId: 100,
      };

      const rendered = renderMessageList([
        ...historicMessages,
        streamingBase,
      ]);

      for (
        let delta = 1;
        delta <= 5;
        delta += 1
      ) {
        renderMessageList(
          [
            ...historicMessages,
            {
              ...streamingBase,
              content: "x".repeat(delta),
            },
          ],
          rendered
        );
      }

      const historicRowRenders =
        messageItemRenderSpy.mock.calls.filter(
          ([props]) =>
            props.authorName ===
            "Historic 1"
        );

      const streamingRowRenders =
        messageItemRenderSpy.mock.calls.filter(
          ([props]) =>
            props.authorName ===
            "ChatGPT"
        );

      // Historic rows retain the same message object and callbacks,
      // while the streaming row receives a new message object.
      expect(historicRowRenders).toHaveLength(
        1
      );
      expect(streamingRowRenders).toHaveLength(
        6
      );
    });

    it("coalesces 20 streaming message-array updates into one scroll", () => {
      const scrollToSpy = vi.mocked(
        HTMLElement.prototype.scrollTo
      );

      const baseMessage: ChatMessage = {
        id: -1,
        authorType: "ai",
        authorName: "ChatGPT",
        content: "",
        createdAt: new Date(0),
        isOwnMessage: false,
        isStreaming: true,
        provider: "openai",
        sourceMessageId: 100,
      };

      const rendered = renderMessageList([
        baseMessage,
      ]);

      for (
        let delta = 1;
        delta <= 20;
        delta += 1
      ) {
        renderMessageList(
          [
            {
              ...baseMessage,
              content: "x".repeat(delta),
            },
          ],
          rendered
        );
      }

      expect(scrollToSpy).not.toHaveBeenCalled();

      flushAnimationFrames();

      // The mount and all 20 updates share one animation frame.
      expect(scrollToSpy).toHaveBeenCalledTimes(
        1
      );
    });
  }
);
