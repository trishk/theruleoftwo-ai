import { describe, expect, it } from "vitest";

import {
  classifyConversation,
  createConversationSummary,
} from "@/lib/chat/conversation-summary";

const owner = {
  id: "owner-1",
  name: "Ada Lovelace",
  avatarUrl: null,
};

function summary(
  overrides: Partial<Parameters<typeof createConversationSummary>[0]> = {}
) {
  const defaults: Parameters<typeof createConversationSummary>[0] = {
    conversation: {
      id: 42,
      publicId: "public-42",
      title: "Decision",
      ownerId: owner.id,
      owner,
      members: [],
      readStates: [],
      messages: [],
    },
    aiProviderIds: [],
    latestOtherMessageAt: null,
    currentUserId: owner.id,
    activeConversationId: null,
  };

  return createConversationSummary({ ...defaults, ...overrides });
}

describe("conversation summary", () => {
  it.each([
    [2, 0, "human-1:1"],
    [1, 0, "human-1:1"],
    [1, 1, "ai-1:1"],
    [3, 0, "human-group"],
    [2, 1, "mixed-or-multi-ai-group"],
    [1, 2, "mixed-or-multi-ai-group"],
  ] as const)(
    "classifies %i humans and %i AIs as %s",
    (humanCount, aiCount, expected) => {
      expect(classifyConversation(humanCount, aiCount)).toBe(expected);
    }
  );

  it("counts all humans plus the distinct participating AI subset", () => {
    const result = summary({
      conversation: {
        id: 42,
        publicId: "public-42",
        title: "Decision",
        ownerId: owner.id,
        owner,
        members: [
          { user: { id: "member-1", name: "Grace Hopper", avatarUrl: null } },
        ],
        readStates: [],
        messages: [],
      },
      aiProviderIds: ["openai", "anthropic", "openai"],
    });

    expect(result).toMatchObject({
      humanCount: 2,
      aiCount: 2,
      participantCount: 4,
      conversationType: "mixed-or-multi-ai-group",
    });
    expect(result.participants.map((participant) => participant.id)).toEqual([
      "owner-1",
      "member-1",
      "ai:openai",
      "ai:anthropic",
    ]);
  });

  it("preserves owner and guest fallbacks for unnamed humans", () => {
    const result = summary({
      conversation: {
        id: 42,
        publicId: "public-42",
        title: "Decision",
        ownerId: owner.id,
        owner: { ...owner, name: null },
        members: [{
          user: { id: "member-1", name: null, avatarUrl: null },
        }],
        readStates: [],
        messages: [],
      },
    });

    expect(result.participants.map((participant) => participant.displayName))
      .toEqual(["Owner", "Guest"]);
  });

  it("shapes latest author and preview without losing unread state", () => {
    const createdAt = new Date("2026-09-01T12:00:00Z");
    const result = summary({
      conversation: {
        id: 42,
        publicId: "public-42",
        title: "Decision",
        ownerId: owner.id,
        owner,
        members: [],
        readStates: [{ lastReadAt: new Date("2026-09-01T11:00:00Z") }],
        messages: [{
          authorType: "ai",
          authorId: "google",
          content: "  Latest answer with spacing  ",
          createdAt,
        }],
      },
      aiProviderIds: ["google"],
      latestOtherMessageAt: createdAt,
    });

    expect(result.latestMessageAuthor).toMatchObject({
      id: "ai:google",
      displayName: "Gemini",
      providerId: "google",
    });
    expect(result.latestMessagePreview).toBe("Latest answer with spacing");
    expect(result.hasUnread).toBe(true);
  });

  it("never marks the active conversation unread", () => {
    const createdAt = new Date("2026-09-01T12:00:00Z");
    expect(summary({
      conversation: {
        id: 42,
        publicId: "public-42",
        title: "Decision",
        ownerId: owner.id,
        owner,
        members: [],
        readStates: [],
        messages: [{
          authorType: "human",
          authorId: "member-1",
          content: "Hello",
          createdAt,
        }],
      },
      latestOtherMessageAt: createdAt,
      activeConversationId: 42,
    }).hasUnread).toBe(false);
  });
});
