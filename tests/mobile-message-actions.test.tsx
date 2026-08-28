// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import "@testing-library/jest-dom/vitest";

import { MessageComposer } from "@/components/chat/composer/MessageComposer";
import { MessageList } from "@/components/chat/conversation/MessageList";
import type { ChatMessage } from "@/components/chat/conversation/types";

const noop = () => {};

function message(
  id: number,
  content = `Message ${id}`
): ChatMessage {
  return {
    id,
    authorType: "human",
    authorName: `Author ${id}`,
    content,
    createdAt: new Date(0),
    isOwnMessage: false,
    replyTo: null,
  };
}

function renderList(
  messages = [message(1)],
  props: {
    conversationId?: number;
    onReply?: (value: ChatMessage) => void;
  } = {}
) {
  return render(
    <MessageList
      messages={messages}
      conversationId={props.conversationId}
      onReply={props.onReply ?? noop}
      onRetry={noop}
    />
  );
}

function touchStart(target: Element, x = 10, y = 10) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: "touch",
    clientX: x,
    clientY: y,
  });
}

function longPress(target: Element) {
  touchStart(target);
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

describe("mobile message actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens after a touch long press, but not after a normal tap or early release", () => {
    renderList();
    const target = screen.getByTestId("message-1");

    fireEvent.pointerDown(target, {
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerUp(target, {
      pointerId: 1,
      pointerType: "touch",
    });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    touchStart(target);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(target, {
      pointerId: 1,
      pointerType: "touch",
    });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    longPress(target);
    expect(screen.getByRole("menu", { name: /Message actions/ })).toBeInTheDocument();
  });

  it("cancels when the pointer moves meaningfully before the threshold", () => {
    renderList();
    const target = screen.getByTestId("message-1");
    touchStart(target, 10, 10);
    fireEvent.pointerMove(target, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 30,
      clientY: 10,
    });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("routes Reply through the existing callback and focuses the composer", () => {
    const targetMessage = message(7, "Reply target");

    function Harness() {
      const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
      return (
        <>
          <MessageList
            messages={[targetMessage]}
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
            onCancelReply={() => setReplyTo(null)}
            onSubmit={async () => {}}
            onStopGeneration={noop}
          />
        </>
      );
    }

    render(<Harness />);
    longPress(screen.getByTestId("message-7"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reply" }));

    expect(screen.getByText("Replying to Author 7")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask for another perspective...")).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("copies exact message content and closes safely", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderList([message(1, "Line one\nLine two")]);

    longPress(screen.getByTestId("message-1"));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    });

    expect(writeText).toHaveBeenCalledWith("Line one\nLine two");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("falls back safely when the clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Denied"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    renderList([message(1, "Fallback content")]);

    longPress(screen.getByTestId("message-1"));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText("Message copied")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps only one menu open and closes on outside press or Escape", () => {
    renderList([message(1), message(2)]);
    longPress(screen.getByTestId("message-1"));
    expect(screen.getByRole("menu")).toHaveAccessibleName("Message actions for Author 1");

    longPress(screen.getByTestId("message-2"));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu")).toHaveAccessibleName("Message actions for Author 2");

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    longPress(screen.getByTestId("message-1"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not offer Reply for a non-replyable message", () => {
    renderList([message(-1)]);
    longPress(screen.getByTestId("message--1"));
    expect(screen.queryByRole("menuitem", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeEnabled();
  });

  it("keeps the desktop hover Reply shortcut in the document", () => {
    renderList();
    expect(screen.getByRole("button", { name: "Reply to Author 1" })).toHaveAttribute(
      "data-desktop-reply",
      "true"
    );
  });

  it("clears the menu when the conversation changes", () => {
    const rendered = renderList([message(1)], { conversationId: 10 });
    longPress(screen.getByTestId("message-1"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rendered.rerender(
      <MessageList
        messages={[message(2)]}
        conversationId={11}
        onReply={noop}
        onRetry={noop}
      />
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
