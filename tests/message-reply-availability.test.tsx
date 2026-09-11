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

  it("integrates a compact attributed and truncated reply preview into the composer shell", () => {
    const longContent = "A very long reply ".repeat(30);

    render(
      <MessageComposer
        message=""
        sending={false}
        error={null}
        replyTo={{
          id: 10,
          authorName: "Tudor",
          content: longContent,
        }}
        configuredProviders={[]}
        onMessageChange={noop}
        onCancelReply={noop}
        onSubmit={async () => {}}
        onStopGeneration={noop}
      />
    );

    const shell = screen.getByTestId("composer-shell");
    const preview = screen.getByTestId("reply-preview");
    const content = preview.querySelector(
      ".truncate"
    );

    expect(shell).toContainElement(preview);
    expect(preview).toHaveClass("border-b");
    expect(preview).not.toHaveClass("rounded-md", "mb-2");
    expect(preview).toHaveTextContent("Replying to Tudor");
    expect(content).toHaveTextContent(
      longContent.trim()
    );
    expect(content).toHaveClass("truncate");
  });

  it("cancels reply with a mobile 44px hit target and a compact icon", () => {
    const onCancelReply = vi.fn();

    render(
      <MessageComposer
        message=""
        sending={false}
        error={null}
        replyTo={{
          id: 10,
          authorName: "Tudor",
          content: "Message",
        }}
        configuredProviders={[]}
        onMessageChange={noop}
        onCancelReply={onCancelReply}
        onSubmit={async () => {}}
        onStopGeneration={noop}
      />
    );

    const cancel = screen.getByRole("button", {
      name: "Cancel reply",
    });
    expect(cancel).toHaveClass("h-11", "w-11");
    expect(cancel.firstElementChild).toHaveClass("text-base");

    fireEvent.click(cancel);
    expect(onCancelReply).toHaveBeenCalledOnce();
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

    fireEvent.click(screen.getByRole("button", { name: "Mention an AI" }));
    fireEvent.click(screen.getByRole("option", { name: /ChatGPT/ }));

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
          provider: "openai",
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
        provider: "openai",
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

  it("renders multiline own-human content in the shared left-aligned row anatomy", () => {
    const multilineContent = "Line 1\nLine 2 is longer\nLine 3";
    renderMessages([
      createMessage({
        id: 15,
        isOwnMessage: true,
        content: multilineContent,
      }),
    ]);

    const contentElement = screen.getByText(
      /Line 1[\s\S]*Line 2 is longer[\s\S]*Line 3/
    );
    expect(contentElement).toHaveClass("whitespace-pre-wrap");
    const row = screen.getByTestId("message-15");
    expect(row).toHaveAttribute("data-current-user", "true");
    expect(row.className).not.toContain("justify-end");
    expect(row.innerHTML).not.toContain("bg-[#2563EB]");
    expect(
      row.querySelectorAll("[data-message-part]")
    ).toHaveLength(4);
  });

  it("renders a compact accessible thinking state when an AI message is streaming with empty content and removes it when content arrives", () => {
    const onReply = vi.fn();
    const rendered = renderMessages(
      [
        createMessage({
          id: -20,
          authorType: "ai",
          authorName: "ChatGPT",
          content: "",
          isStreaming: true,
        }),
      ],
      onReply
    );

    const thinkingState = screen.getByRole("status");
    expect(thinkingState).toBeInTheDocument();
    expect(thinkingState).toHaveTextContent("Thinking...");
    expect(thinkingState.querySelector(".animate-pulse")).toHaveClass(
      "motion-reduce:animate-none"
    );

    rendered.rerender(
      <MessageList
        messages={[
          createMessage({
            id: -20,
            authorType: "ai",
            authorName: "ChatGPT",
            content: "First token received",
            isStreaming: true,
          }),
        ]}
        onReply={onReply}
        onRetry={noop}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Responding…");
    expect(screen.getByText("First token received")).toBeInTheDocument();

    rendered.rerender(
      <MessageList
        messages={[
          createMessage({
            id: 205,
            authorType: "ai",
            authorName: "ChatGPT",
            content: "First token received",
            isStreaming: false,
          }),
        ]}
        onReply={onReply}
        onRetry={noop}
      />
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("First token received")).toBeInTheDocument();
  });

  it("renders a subtle timestamp for messages using createdAt without timezone fragility", () => {
    const timestamp = new Date(2026, 7, 27, 14, 30);
    const expectedTime = timestamp.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    renderMessages([
      createMessage({
        id: 30,
        authorType: "human",
        authorName: "Tudor",
        createdAt: timestamp,
      }),
      createMessage({
        id: 31,
        authorType: "ai",
        authorName: "ChatGPT",
        createdAt: timestamp,
      }),
    ]);

    const timeElements = screen.getAllByText(expectedTime);
    expect(timeElements).toHaveLength(2);
    timeElements.forEach((el) => {
      expect(el.tagName).toBe("TIME");
      expect(el).toHaveClass("text-xs", "text-muted-foreground");
      expect(el).toHaveAttribute("dateTime", timestamp.toISOString());
    });
  });

  it("shows an accessible continuing status alongside streamed text", () => {
    renderMessages([
      createMessage({
        id: -40,
        authorType: "ai",
        authorName: "ChatGPT",
        provider: "openai",
        content: "Partial answer",
        isStreaming: true,
      }),
    ]);

    expect(screen.getByText("Partial answer")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Responding…");
  });

  it("labels a stopped partial response without hiding its content", () => {
    renderMessages([
      createMessage({
        id: -41,
        authorType: "ai",
        authorName: "Claude",
        provider: "anthropic",
        content: "Partial answer",
        isStopped: true,
      }),
    ]);

    expect(screen.getByText("Partial answer")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Stopped");
  });

  it("renders retryable errors as alerts with an accessible Retry action", () => {
    const onRetry = vi.fn();
    render(
      <MessageList
        messages={[
          createMessage({
            id: -42,
            authorType: "ai",
            authorName: "ChatGPT",
            provider: "openai",
            content: "ChatGPT failed to respond.",
            isError: true,
          }),
        ]}
        onReply={noop}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "ErrorChatGPT failed to respond."
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry ChatGPT" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders an empty failed output as a compact retryable status", () => {
    const onRetry = vi.fn();
    render(
      <MessageList
        messages={[createMessage({
          id: 44,
          authorType: "ai",
          authorName: "ChatGPT",
          provider: "openai",
          content: "",
          isError: true,
          attemptId: "attempt-failed",
          sourceMessageId: 10,
        })]}
        onReply={noop}
        onRetry={onRetry}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("ErrorGeneration interrupted.");
    expect(document.querySelector('[data-message-part="body"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry ChatGPT" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders non-retryable errors as alerts without Retry", () => {
    render(
      <MessageList
        messages={[
          createMessage({
            id: -43,
            authorType: "ai",
            authorName: "ChatGPT",
            provider: "openai",
            content: "ChatGPT is not connected.",
            isError: true,
            isRetryable: false,
          }),
        ]}
        onReply={noop}
        onRetry={noop}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "ErrorChatGPT is not connected."
    );
    expect(
      screen.queryByRole("button", { name: "Retry ChatGPT" })
    ).not.toBeInTheDocument();
  });

  it("wraps long reply and message content without changing multiline text", () => {
    const longToken = "https://example.test/" + "segment".repeat(40);
    renderMessages([
      createMessage({
        id: 44,
        content: `Line one\n${longToken}`,
        replyTo: {
          id: 10,
          authorName: "Grace",
          content: `First reply line\n${longToken}`,
        },
      }),
    ]);

    const body = screen.getByText(/Line one/);
    expect(body).toHaveClass(
      "whitespace-pre-wrap",
      "[overflow-wrap:anywhere]"
    );
    const replyContent = screen.getByText(/First reply line/);
    expect(replyContent).toHaveClass(
      "line-clamp-2",
      "whitespace-pre-wrap",
      "[overflow-wrap:anywhere]"
    );
  });
});
