import { describe, expect, it } from "vitest";

import { doesStreamingMessageMatchPersisted } from "@/components/chat/conversation/reconcileStreamingMessages";
import type { ChatMessage } from "@/components/chat/conversation/types";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: -1,
    authorType: "ai",
    authorName: "ChatGPT",
    content: "Mocked LLM response",
    createdAt: new Date("2026-08-26T09:00:00Z"),
    isOwnMessage: false,
    provider: "openai",
    sourceMessageId: 100,
    ...overrides,
  };
}

describe("doesStreamingMessageMatchPersisted", () => {
  it("matches equal content from the same provider", () => {
    expect(
      doesStreamingMessageMatchPersisted(message(), message({ id: 200 }))
    ).toBe(true);
  });

  it("matches a persisted continuation only for a stopped non-empty partial", () => {
    const persisted = message({ id: 200, content: "The answer is 4" });

    expect(
      doesStreamingMessageMatchPersisted(
        message({ content: "The answer is", isStopped: true }),
        persisted
      )
    ).toBe(true);
    expect(
      doesStreamingMessageMatchPersisted(
        message({ content: "The answer is" }),
        persisted
      )
    ).toBe(false);
    expect(
      doesStreamingMessageMatchPersisted(
        message({ content: "", isStopped: true }),
        persisted
      )
    ).toBe(false);
  });

  it("rejects different content, providers, and non-AI persisted rows", () => {
    const streaming = message();

    expect(
      doesStreamingMessageMatchPersisted(
        streaming,
        message({ id: 200, content: "Different" })
      )
    ).toBe(false);
    expect(
      doesStreamingMessageMatchPersisted(
        streaming,
        message({ id: 200, provider: "anthropic" })
      )
    ).toBe(false);
    expect(
      doesStreamingMessageMatchPersisted(
        streaming,
        message({ id: 200, authorType: "human" })
      )
    ).toBe(false);
  });
});
