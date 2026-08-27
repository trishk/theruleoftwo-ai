// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import "@testing-library/jest-dom/vitest";

import { MessageList } from "@/components/chat/conversation/MessageList";
import { MessageComposer } from "@/components/chat/composer/MessageComposer";
import type { ChatMessage } from "@/components/chat/conversation/types";

const noop = () => {};

function renderMessages(
  messages: ChatMessage[],
  onReply = vi.fn()
) {
  const rendered = render(
    <MessageList
      messages={messages}
      onReply={onReply}
      onRetry={noop}
    />
  );

  return {
    ...rendered,
    onReply,
  };
}

function createMessage(
  overrides: Partial<ChatMessage>
): ChatMessage {
  return {
    id: 1,
    authorType: "human",
    authorName: "Tudor",
    content: "Message",
    createdAt: new Date(0),
    isOwnMessage: false,
    isStreaming: false,
    isError: false,
    replyTo: null,
    ...overrides,
  };
}

describe("message reply availability", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );

    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn()
    );
  });

  it("allows replying to a persisted positive-id human message", () => {
    const message = createMessage({
      id: 10,
    });

    const { onReply } = renderMessages([
      message,
    ]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reply to Tudor",
      })
    );

    expect(onReply).toHaveBeenCalledWith(
      message
    );
  });

  it("focuses the composer textarea after selecting a reply target", () => {
    const message = createMessage({
      id: 10,
    });

    function ReplyHarness() {
      const [replyTo, setReplyTo] =
        useState<ChatMessage | null>(null);

      return (
        <>
          <MessageList
            messages={[message]}
            onReply={setReplyTo}
            onRetry={noop}
          />
          <MessageComposer
            message=""
            sending={false}
            error={null}
            replyTo={replyTo}
            configuredProviders={[]}
            onMessageChange={noop}
            onCancelReply={() =>
              setReplyTo(null)
            }
            onSubmit={async () => {}}
            onStopGeneration={noop}
          />
        </>
      );
    }

    render(<ReplyHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reply to Tudor",
      })
    );

    expect(
      screen.getByPlaceholderText(
        "Ask for another perspective..."
      )
    ).toBe(document.activeElement);
  });

  it("continues to focus the composer textarea after selecting a mention", () => {
    function MentionHarness() {
      const [message, setMessage] =
        useState("");

      return (
        <MessageComposer
          message={message}
          sending={false}
          error={null}
          replyTo={null}
          configuredProviders={[
            "openai",
          ]}
          onMessageChange={setMessage}
          onCancelReply={noop}
          onSubmit={async () => {}}
          onStopGeneration={noop}
        />
      );
    }

    render(<MentionHarness />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /ChatGPT/,
      })
    );

    expect(
      screen.getByPlaceholderText(
        "Ask for another perspective..."
      )
    ).toBe(document.activeElement);
  });

  it("does not allow replying to an optimistic negative-id human message", () => {
    renderMessages([
      createMessage({
        id: -10,
      }),
    ]);

    expect(
      screen.queryByRole("button", {
        name: "Reply to Tudor",
      })
    ).not.toBeInTheDocument();
  });

  it("does not allow replying to a streaming negative-id AI message", () => {
    renderMessages([
      createMessage({
        id: -11,
        authorType: "ai",
        authorName: "ChatGPT",
        isStreaming: true,
      }),
    ]);

    expect(
      screen.queryByRole("button", {
        name: "Reply to ChatGPT",
      })
    ).not.toBeInTheDocument();
  });

  it("does not allow replying to a completed but unreconciled negative-id AI placeholder", () => {
    renderMessages([
      createMessage({
        id: -12,
        authorType: "ai",
        authorName: "ChatGPT",
        isStreaming: false,
      }),
    ]);

    expect(
      screen.queryByRole("button", {
        name: "Reply to ChatGPT",
      })
    ).not.toBeInTheDocument();
  });

  it("enables Reply after an AI placeholder reconciles to a positive persisted id", () => {
    const onReply = vi.fn();

    const rendered = renderMessages(
      [
        createMessage({
          id: -13,
          authorType: "ai",
          authorName: "ChatGPT",
          content: "Final answer",
          isStreaming: false,
        }),
      ],
      onReply
    );

    expect(
      screen.queryByRole("button", {
        name: "Reply to ChatGPT",
      })
    ).not.toBeInTheDocument();

    const persistedMessage =
      createMessage({
        id: 201,
        authorType: "ai",
        authorName: "ChatGPT",
        content: "Final answer",
        isStreaming: false,
      });

    rendered.rerender(
      <MessageList
        messages={[persistedMessage]}
        onReply={onReply}
        onRetry={noop}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reply to ChatGPT",
      })
    );

    expect(onReply).toHaveBeenCalledWith(
      persistedMessage
    );
  });
});
