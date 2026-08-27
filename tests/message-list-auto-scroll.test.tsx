// @vitest-environment jsdom

import {
  fireEvent,
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

import { MessageList } from "@/components/chat/conversation/MessageList";
import type { ChatMessage } from "@/components/chat/conversation/types";

const noop = () => {};

let animationFrameCallbacks: Array<
  FrameRequestCallback
> = [];

function flushAnimationFrames() {
  const callbacks = animationFrameCallbacks;
  animationFrameCallbacks = [];

  callbacks.forEach((callback) => callback(0));
}

function humanMessage(
  id: number,
  isOwnMessage = true
): ChatMessage {
  return {
    id,
    authorType: "human",
    authorName: isOwnMessage ? "You" : "Someone else",
    content: `Human message ${id}`,
    createdAt: new Date(id),
    isOwnMessage,
  };
}

function streamingMessage(
  id: number,
  provider: "openai" | "anthropic" | "google",
  content = ""
): ChatMessage {
  return {
    id,
    authorType: "ai",
    authorName: provider,
    content,
    createdAt: new Date(100 + Math.abs(id)),
    isOwnMessage: false,
    isStreaming: true,
    provider,
    sourceMessageId: 1,
  };
}

function renderList(
  messages: ChatMessage[],
  existing?: RenderResult,
  followBottomSignal = 0,
  conversationId = 1
) {
  const element = (
    <MessageList
      messages={messages}
      followBottomSignal={followBottomSignal}
      conversationId={conversationId}
      onReply={noop}
      onRetry={noop}
    />
  );

  if (existing) {
    existing.rerender(element);
    return existing;
  }

  return render(element);
}

function setGeometry(
  container: HTMLElement,
  geometry: {
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
  }
) {
  for (const property of [
    "scrollHeight",
    "clientHeight",
    "scrollTop",
  ] as const) {
    Object.defineProperty(container, property, {
      configurable: true,
      get: () => geometry[property],
      set: (value: number) => {
        geometry[property] = value;
      },
    });
  }
}

describe("MessageList bottom following", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    animationFrameCallbacks = [];

    Object.defineProperty(
      HTMLElement.prototype,
      "scrollTo",
      {
        configurable: true,
        value: vi.fn(),
      }
    );

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameCallbacks.push(callback);
        return animationFrameCallbacks.length;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("keeps a just-sent human message visible after an intermediate smooth-scroll event", () => {
    const rendered = renderList([humanMessage(1)]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    const geometry = {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 500,
    };
    setGeometry(container, geometry);
    flushAnimationFrames();

    // A browser emits scroll events while a smooth scroll is in flight.
    geometry.scrollHeight = 1400;
    geometry.scrollTop = 650;
    fireEvent.scroll(container);

    renderList(
      [humanMessage(1), humanMessage(-1)],
      rendered
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 1400,
      behavior: "smooth",
    });
  });

  it("follows when an AI response starts at the bottom", () => {
    const rendered = renderList([humanMessage(1)]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    setGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 500,
    });
    flushAnimationFrames();

    renderList(
      [humanMessage(1), streamingMessage(-1, "openai")],
      rendered
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });

  it("continues following multiple streaming updates while pinned", () => {
    const base = streamingMessage(-1, "openai");
    const rendered = renderList([humanMessage(1), base]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    setGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 500,
    });
    flushAnimationFrames();

    for (const content of ["a", "ab", "abc"]) {
      renderList(
        [humanMessage(1), { ...base, content }],
        rendered
      );
      flushAnimationFrames();
    }

    expect(container.scrollTo).toHaveBeenCalledTimes(4);
  });

  it("does not follow streaming updates after the user scrolls upward", () => {
    const base = streamingMessage(-1, "openai");
    const rendered = renderList([humanMessage(1), base]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    const geometry = {
      scrollHeight: 1400,
      clientHeight: 500,
      scrollTop: 900,
    };
    setGeometry(container, geometry);
    flushAnimationFrames();

    fireEvent.scroll(container);
    geometry.scrollTop = 400;
    fireEvent.scroll(container);
    renderList(
      [humanMessage(1), { ...base, content: "new delta" }],
      rendered
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("resumes following after the user manually returns to the bottom", () => {
    const base = streamingMessage(-1, "openai");
    const rendered = renderList([humanMessage(1), base]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    const geometry = {
      scrollHeight: 1400,
      clientHeight: 500,
      scrollTop: 900,
    };
    setGeometry(container, geometry);
    flushAnimationFrames();

    geometry.scrollTop = 400;
    fireEvent.scroll(container);
    geometry.scrollTop = 900;
    fireEvent.scroll(container);

    renderList(
      [humanMessage(1), { ...base, content: "new delta" }],
      rendered
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenCalledTimes(2);
  });

  it("restores bottom following when the user sends after reading history", () => {
    const rendered = renderList([humanMessage(1)]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    const geometry = {
      scrollHeight: 1400,
      clientHeight: 500,
      scrollTop: 900,
    };
    setGeometry(container, geometry);
    flushAnimationFrames();

    geometry.scrollTop = 400;
    geometry.scrollHeight = 1600;
    renderList(
      [humanMessage(1), humanMessage(-1)],
      rendered,
      1
    );
    // The native scroll event can be delivered after the submit update.
    fireEvent.scroll(container);
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenCalledTimes(2);
    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 1600,
      behavior: "auto",
    });

    renderList(
      [
        humanMessage(1),
        humanMessage(-1),
        streamingMessage(-2, "openai"),
      ],
      rendered,
      1
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenCalledTimes(3);
  });

  it("preserves bottom following across multiple provider updates", () => {
    const openai = streamingMessage(-1, "openai");
    const anthropic = streamingMessage(-2, "anthropic");
    const google = streamingMessage(-3, "google");
    const rendered = renderList([
      humanMessage(1),
      openai,
      anthropic,
      google,
    ]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    setGeometry(container, {
      scrollHeight: 1200,
      clientHeight: 500,
      scrollTop: 700,
    });
    flushAnimationFrames();

    renderList(
      [
        humanMessage(1),
        { ...openai, content: "OpenAI delta" },
        anthropic,
        { ...google, content: "Google delta" },
      ],
      rendered
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenCalledTimes(2);
    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 1200,
      behavior: "auto",
    });
  });

  it("resets history-reading state when the conversation changes", () => {
    const rendered = renderList([humanMessage(1)]);
    const container = rendered.container
      .firstElementChild as HTMLElement;
    const geometry = {
      scrollHeight: 1400,
      clientHeight: 500,
      scrollTop: 900,
    };
    setGeometry(container, geometry);
    flushAnimationFrames();

    geometry.scrollTop = 300;
    fireEvent.scroll(container);
    geometry.scrollHeight = 1800;

    renderList(
      [humanMessage(101, false), humanMessage(102, false)],
      rendered,
      0,
      2
    );
    flushAnimationFrames();

    expect(container.scrollTo).toHaveBeenCalledTimes(2);
    expect(container.scrollTo).toHaveBeenLastCalledWith({
      top: 1800,
      behavior: "auto",
    });
  });
});
