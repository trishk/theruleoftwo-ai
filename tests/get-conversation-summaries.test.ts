import { beforeEach, describe, expect, it, vi } from "vitest";

const { conversationFindManyMock, messageGroupByMock } = vi.hoisted(() => ({
  conversationFindManyMock: vi.fn(),
  messageGroupByMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: { findMany: conversationFindManyMock },
    message: { groupBy: messageGroupByMock },
  },
}));

import { getConversationSummaries } from "@/lib/chat/get-conversation-summaries";

describe("getConversationSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationFindManyMock.mockResolvedValue([
      {
        id: 1,
        publicId: "first",
        title: "First",
        ownerId: "user-1",
        owner: { id: "user-1", name: "Ada", avatarUrl: null },
        members: [],
        readStates: [{ lastReadAt: new Date("2026-09-01T10:00:00Z") }],
        messages: [{
          authorType: "ai",
          authorId: "openai",
          content: "Latest",
          createdAt: new Date("2026-09-01T12:00:00Z"),
        }],
      },
      {
        id: 2,
        publicId: "second",
        title: "Second",
        ownerId: "user-2",
        owner: { id: "user-2", name: "Grace", avatarUrl: null },
        members: [{
          user: { id: "user-1", name: "Ada", avatarUrl: null },
        }],
        readStates: [],
        messages: [],
      },
    ]);
    messageGroupByMock.mockResolvedValue([
      {
        conversationId: 1,
        authorType: "ai",
        authorId: "openai",
        _max: { createdAt: new Date("2026-09-01T12:00:00Z") },
      },
      {
        conversationId: 1,
        authorType: "human",
        authorId: "user-2",
        _max: { createdAt: new Date("2026-09-01T11:00:00Z") },
      },
    ]);
  });

  it("uses two bounded bulk queries rather than per-conversation message queries", async () => {
    const summaries = await getConversationSummaries({
      currentUserId: "user-1",
      activeConversationId: null,
    });

    expect(conversationFindManyMock).toHaveBeenCalledOnce();
    expect(conversationFindManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerId: "user-1" },
          { members: { some: { userId: "user-1" } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        publicId: true,
        title: true,
        ownerId: true,
        owner: { select: { id: true, name: true, avatarUrl: true } },
        members: {
          select: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        readStates: {
          where: { userId: "user-1" },
          select: { lastReadAt: true },
          take: 1,
        },
        messages: {
          orderBy: { createdAt: "desc" },
          select: {
            authorType: true,
            authorId: true,
            content: true,
            createdAt: true,
          },
          take: 1,
        },
      },
    });
    expect(messageGroupByMock).toHaveBeenCalledOnce();
    expect(messageGroupByMock).toHaveBeenCalledWith({
      by: ["conversationId", "authorType", "authorId"],
      where: { conversationId: { in: [1, 2] } },
      _max: { createdAt: true },
    });
    expect(summaries[0]).toMatchObject({
      aiCount: 1,
      participantCount: 2,
      latestMessagePreview: "Latest",
      hasUnread: true,
    });
  });

  it("does not issue an aggregate query for an empty conversation list", async () => {
    conversationFindManyMock.mockResolvedValue([]);

    await expect(getConversationSummaries({
      currentUserId: "user-1",
      activeConversationId: null,
    })).resolves.toEqual([]);

    expect(messageGroupByMock).not.toHaveBeenCalled();
  });
});
