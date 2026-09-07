import {
  describe,
  expect,
  it,
} from "vitest";

import { buildConversationTimeline } from "@/components/chat/conversation/buildConversationTimeline";
import type { ChatMessage } from "@/components/chat/conversation/types";

function message(
  id: number,
  createdAt: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id,
    authorType: "human",
    authorName: "Person",
    content: `Message ${id}`,
    createdAt: new Date(createdAt),
    isOwnMessage: false,
    ...overrides,
  };
}

function build({
  persistedMessages = [],
  optimisticMessages = [],
  streamingMessages = [],
}: {
  persistedMessages?: ChatMessage[];
  optimisticMessages?: ChatMessage[];
  streamingMessages?: ChatMessage[];
}) {
  return buildConversationTimeline({
    persistedMessages,
    optimisticMessages,
    streamingMessages,
  });
}

describe("buildConversationTimeline", () => {
  it("globally orders persisted, remote, optimistic, and streaming contributions by creation time", () => {
    const timeline = build({
      persistedMessages: [
        message(4, "2026-09-06T10:00:04.000Z", {
          content: "Remote refresh",
        }),
        message(1, "2026-09-06T10:00:01.000Z", {
          content: "Persisted history",
        }),
      ],
      optimisticMessages: [
        message(-2, "2026-09-06T10:00:03.000Z", {
          content: "Optimistic human",
          isOwnMessage: true,
        }),
      ],
      streamingMessages: [
        message(-1, "2026-09-06T10:00:02.000Z", {
          authorType: "ai",
          authorName: "ChatGPT",
          content: "Streaming AI",
          provider: "openai",
          isStreaming: true,
        }),
      ],
    });

    expect(timeline.map((item) => item.content)).toEqual([
      "Persisted history",
      "Streaming AI",
      "Optimistic human",
      "Remote refresh",
    ]);
  });

  it("uses message IDs as a deterministic stable tie-breaker within the same millisecond", () => {
    const timestamp = "2026-09-06T10:00:00.000Z";
    const timeline = build({
      persistedMessages: [
        message(12, timestamp),
        message(10, timestamp),
      ],
      optimisticMessages: [
        message(-102, timestamp),
        message(-100, timestamp),
      ],
      streamingMessages: [
        message(-101, timestamp, {
          authorType: "ai",
          provider: "openai",
        }),
      ],
    });

    // Persisted IDs increase with creation. Temporary IDs decrease as they
    // are created, so descending temporary IDs retain creation chronology.
    expect(timeline.map((item) => item.id)).toEqual([
      10,
      12,
      -100,
      -101,
      -102,
    ]);
  });

  it("keeps a streaming row key and position stable while tokens update", () => {
    const persisted = [
      message(1, "2026-09-06T10:00:00.000Z"),
      message(2, "2026-09-06T10:00:02.000Z"),
    ];
    const streamingBase = message(
      -10,
      "2026-09-06T10:00:01.000Z",
      {
        authorType: "ai",
        authorName: "Claude",
        provider: "anthropic",
        content: "",
        isStreaming: true,
      }
    );

    const before = build({
      persistedMessages: persisted,
      streamingMessages: [streamingBase],
    });
    const after = build({
      persistedMessages: persisted,
      streamingMessages: [
        { ...streamingBase, content: "First tokens" },
      ],
    });

    expect(before.map((item) => item.id)).toEqual([1, -10, 2]);
    expect(after.map((item) => item.id)).toEqual([1, -10, 2]);
    expect(after[1]?.timelineKey).toBe(before[1]?.timelineKey);
  });

  it("replaces reconciled optimistic and streaming rows without duplicates while preserving their timeline keys", () => {
    const optimistic = message(
      -20,
      "2026-09-06T10:00:01.000Z",
      {
        authorName: "You",
        content: "Same human contribution",
        isOwnMessage: true,
      }
    );
    const streaming = message(
      -21,
      "2026-09-06T10:00:02.000Z",
      {
        authorType: "ai",
        authorName: "ChatGPT",
        content: "Same AI contribution",
        provider: "openai",
        sourceMessageId: 100,
      }
    );

    const timeline = build({
      persistedMessages: [
        message(100, "2026-09-06T10:00:01.100Z", {
          authorName: "Current user",
          content: "Same human contribution",
          isOwnMessage: true,
        }),
        message(101, "2026-09-06T10:00:03.000Z", {
          content: "Remote contribution",
        }),
        message(102, "2026-09-06T10:00:02.100Z", {
          authorType: "ai",
          authorName: "ChatGPT",
          content: "Same AI contribution",
          provider: "openai",
          sourceMessageId: 100,
        }),
      ],
      optimisticMessages: [optimistic],
      streamingMessages: [streaming],
    });

    expect(timeline.map((item) => item.id)).toEqual([
      100,
      102,
      101,
    ]);
    expect(timeline.map((item) => item.timelineKey)).toEqual([
      "temporary:-20",
      "temporary:-21",
      "persisted:101",
    ]);
    expect(
      timeline.filter(
        (item) => item.content === "Same human contribution"
      )
    ).toHaveLength(1);
    expect(
      timeline.filter(
        (item) => item.content === "Same AI contribution"
      )
    ).toHaveLength(1);
  });

  it("uses an acknowledged persisted ID to reconcile identical optimistic submissions", () => {
    const timeline = build({
      persistedMessages: [
        message(100, "2026-09-06T10:00:01.100Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
        }),
        message(101, "2026-09-06T10:00:02.100Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
        }),
      ],
      optimisticMessages: [
        message(-40, "2026-09-06T10:00:01.000Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
          persistedMessageId: 101,
        }),
        message(-41, "2026-09-06T10:00:02.000Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
          persistedMessageId: 100,
        }),
      ],
    });

    expect(timeline.map((item) => item.id)).toEqual([101, 100]);
    expect(timeline.map((item) => item.timelineKey)).toEqual([
      "temporary:-40",
      "temporary:-41",
    ]);
  });

  it("claims acknowledged identical messages before heuristic matches", () => {
    const older = message(-50, "2026-09-06T10:00:01.000Z", {
      content: "Repeated contribution",
      isOwnMessage: true,
    });
    const newer = message(-51, "2026-09-06T10:00:02.000Z", {
      content: "Repeated contribution",
      isOwnMessage: true,
      persistedMessageId: 101,
    });
    const persistedNewer = message(101, "2026-09-06T10:00:01.100Z", {
      content: "Repeated contribution",
      isOwnMessage: true,
    });

    const partiallyAcknowledged = build({
      persistedMessages: [persistedNewer],
      optimisticMessages: [older, newer],
    });

    expect(partiallyAcknowledged).toHaveLength(2);
    expect(partiallyAcknowledged.map((item) => item.id)).toEqual([-50, 101]);
    expect(partiallyAcknowledged[1]?.timelineKey).toBe("temporary:-51");

    const fullyAcknowledged = build({
      persistedMessages: [
        message(100, "2026-09-06T10:00:01.050Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
        }),
        persistedNewer,
      ],
      optimisticMessages: [
        { ...older, persistedMessageId: 100 },
        newer,
      ],
    });

    expect(fullyAcknowledged).toHaveLength(2);
    expect(fullyAcknowledged.map((item) => item.id)).toEqual([100, 101]);
    expect(fullyAcknowledged.map((item) => item.timelineKey)).toEqual([
      "temporary:-50",
      "temporary:-51",
    ]);
  });

  it("does not prefer an invalid persisted timestamp over a valid closer match", () => {
    const timeline = build({
      persistedMessages: [
        message(200, "invalid", {
          content: "Repeated contribution",
          isOwnMessage: true,
        }),
        message(201, "2026-09-06T10:00:01.100Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
        }),
      ],
      optimisticMessages: [
        message(-60, "2026-09-06T10:00:01.000Z", {
          content: "Repeated contribution",
          isOwnMessage: true,
        }),
      ],
    });

    expect(timeline.find((item) => item.id === 201)?.timelineKey).toBe(
      "temporary:-60"
    );
    expect(timeline.find((item) => item.id === 200)?.timelineKey).toBe(
      "persisted:200"
    );
  });

  it("keeps participant-level thinking placeholders at their chronological position", () => {
    const timeline = build({
      persistedMessages: [
        message(1, "2026-09-06T10:00:00.000Z"),
        message(2, "2026-09-06T10:00:02.000Z"),
      ],
      streamingMessages: [
        message(-30, "2026-09-06T10:00:01.000Z", {
          authorType: "ai",
          authorName: "Gemini",
          provider: "google",
          content: "",
          isStreaming: true,
        }),
      ],
    });

    expect(timeline.map((item) => item.id)).toEqual([1, -30, 2]);
    expect(timeline[1]).toMatchObject({
      authorName: "Gemini",
      content: "",
      isStreaming: true,
    });
  });
});
