import { describe, expect, it } from "vitest";

import {
  formatConversationMetadata,
  formatConversationPreview,
  getConversationIconKind,
  getConversationPresentation,
  normalizeConversationPreview,
} from "@/lib/chat/conversation-presentation";
import type { ConversationSummary } from "@/lib/chat/conversation-summary";
import type { ParticipantIdentity } from "@/lib/chat/participant-identity";

const humanAuthor: ParticipantIdentity = {
  id: "user-1",
  displayName: "Ada Lovelace",
  type: "human",
  avatarUrl: null,
  initials: "AL",
  isCurrentUser: true,
};

function summary(
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id: 1,
    publicId: "conversation-1",
    title: "Decision",
    ownerId: "user-1",
    participants: [humanAuthor],
    humanCount: 1,
    aiCount: 0,
    participantCount: 1,
    conversationType: "human-1:1",
    latestMessageAuthor: null,
    latestMessagePreview: null,
    hasUnread: false,
    ...overrides,
  };
}

describe("conversation presentation", () => {
  it.each([
    ["human-1:1", 1, 0, "human"],
    ["human-group", 2, 0, "human-group"],
    ["ai-1:1", 1, 1, "ai"],
    ["mixed-or-multi-ai-group", 1, 2, "multi-ai"],
    ["mixed-or-multi-ai-group", 2, 1, "mixed-group"],
    ["mixed-or-multi-ai-group", 2, 2, "mixed-group"],
  ] as const)("maps %s with %i humans and %i AI to %s iconography", (
    conversationType,
    humanCount,
    aiCount,
    expected
  ) => {
    expect(getConversationIconKind({ conversationType, humanCount, aiCount })).toBe(expected);
  });

  it.each([
    [1, 0, "1 participant · 0 AI"],
    [2, 0, "2 participants · 0 AI"],
    [2, 1, "2 participants · 1 AI"],
    [3, 2, "3 participants · 2 AI"],
  ])(
    "formats %i participants and %i AI",
    (participantCount, aiCount, expected) => {
      expect(formatConversationMetadata({ participantCount, aiCount })).toBe(
        expected
      );
    }
  );

  it("normalizes multiline, repeated whitespace, and Unicode content", () => {
    expect(
      normalizeConversationPreview("  Bună\n\n  lume\t🌍   Привет  ")
    ).toBe("Bună lume 🌍 Привет");
  });

  it.each([null, "", " \n\t "])(
    "falls back for an absent or whitespace-only message",
    (content) => {
      expect(
        formatConversationPreview({
          latestMessageAuthor: humanAuthor,
          latestMessagePreview: content,
        })
      ).toBe("No messages yet");
    }
  );

  it("prefixes normalized content with a human or AI author", () => {
    expect(
      formatConversationPreview({
        latestMessageAuthor: humanAuthor,
        latestMessagePreview: "  First line\n second line  ",
      })
    ).toBe("Ada Lovelace: First line second line");

    expect(
      formatConversationPreview({
        latestMessageAuthor: {
          id: "ai:unknown-provider",
          displayName: "Unknown Provider",
          type: "ai",
          providerId: "unknown-provider",
          avatarUrl: null,
          initials: "AI",
          isCurrentUser: false,
        },
        latestMessagePreview: "Answer",
      })
    ).toBe("Unknown Provider: Answer");
  });

  it("returns one shared presentation for a multi-AI conversation", () => {
    expect(
      getConversationPresentation(
        summary({
          participantCount: 3,
          aiCount: 2,
          conversationType: "mixed-or-multi-ai-group",
          latestMessageAuthor: humanAuthor,
          latestMessagePreview: "A long answer",
        })
      )
    ).toEqual({
      iconKind: "multi-ai",
      typeLabel: "Multi-AI conversation",
      metadataLabel: "3 participants · 2 AI",
      preview: "Ada Lovelace: A long answer",
    });
  });
});
