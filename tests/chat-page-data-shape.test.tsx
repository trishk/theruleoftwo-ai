import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  requireUserMock,
  requireConversationAccessMock,
  markConversationReadMock,
  conversationFindUniqueMock,
  integrationFindManyMock,
  userFindManyMock,
  conversationMemberFindFirstMock,
  notFoundMock,
  redirectMock,
  chatHeaderMock,
  chatConversationMock,
  getConversationSummariesMock,
  chatSidebarMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireConversationAccessMock: vi.fn(),
  markConversationReadMock: vi.fn(),
  conversationFindUniqueMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  conversationMemberFindFirstMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirectMock: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  chatHeaderMock: vi.fn(() => null),
  chatConversationMock: vi.fn(() => null),
  getConversationSummariesMock: vi.fn(),
  chatSidebarMock: vi.fn(() => null),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/auth/require-conversation-access", () => ({
  requireConversationAccess: requireConversationAccessMock,
}));

vi.mock("@/lib/conversations/mark-conversation-read", () => ({
  markConversationReadAfterAccessCheck: markConversationReadMock,
}));
vi.mock("@/lib/chat/get-conversation-summaries", () => ({
  getConversationSummaries: getConversationSummariesMock,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: conversationFindUniqueMock,
    },
    conversationMember: { findFirst: conversationMemberFindFirstMock },
    userIntegration: { findMany: integrationFindManyMock },
    user: { findMany: userFindManyMock },
  },
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/components/chat/navigation/ChatHeader", () => ({ ChatHeader: chatHeaderMock }));
vi.mock("@/components/chat/conversation/ChatConversation", () => ({ ChatConversation: chatConversationMock }));
vi.mock("@/components/chat/navigation/ChatShell", () => ({
  ChatShell: ({ children, sidebar }: { children: React.ReactNode; sidebar: React.ReactNode }) => <>{sidebar}{children}</>,
}));
vi.mock("@/components/chat/navigation/ChatSidebar", () => ({ ChatSidebar: chatSidebarMock }));
vi.mock("@/components/chat/realtime/RealtimeConversationSync", () => ({ RealtimeConversationSync: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/chat/realtime/RealtimeSidebarSync", () => ({ RealtimeSidebarSync: ({ children }: { children: unknown }) => children }));

import ChatPage from "@/app/chat/[id]/page";

describe("chat page data shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "user-1", isGuest: false });
    requireConversationAccessMock.mockResolvedValue({
      id: 42,
      ownerId: "owner-1",
      owner: { name: "Conversation Owner" },
    });
    markConversationReadMock.mockResolvedValue(undefined);
    conversationFindUniqueMock
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({
        id: 42,
        title: "Measured chat",
        members: [{ user: { name: "Guest" } }],
        messages: [{
          id: 7,
          authorType: "human",
          authorId: "user-1",
          content: "Hello",
          createdAt: new Date("2026-08-27T00:00:00Z"),
          replyTo: null,
        }],
      });
    getConversationSummariesMock.mockResolvedValue([]);
    conversationMemberFindFirstMock.mockResolvedValue(null);
    integrationFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([{ id: "user-1", name: "User" }]);
  });

  it("reuses access owner data and selects only consumed conversation fields", async () => {
    await ChatPage({ params: Promise.resolve({ id: "public-id" }) });

    expect(conversationFindUniqueMock).toHaveBeenNthCalledWith(2, {
      where: { id: 42 },
      select: {
        id: true,
        title: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorType: true,
            authorId: true,
            content: true,
            createdAt: true,
            replyTo: {
              select: {
                id: true,
                authorType: true,
                authorId: true,
                content: true,
              },
            },
          },
        },
      },
    });
    expect(integrationFindManyMock).toHaveBeenCalledWith({
      where: { userId: "owner-1" },
      select: {
        provider: true,
        encryptedApiKey: true,
        keyIv: true,
        keyAuthTag: true,
      },
    });
  });

  it("renders owner access with isOwner=true", async () => {
    requireUserMock.mockResolvedValue({ id: "owner-1", isGuest: false });

    const page = await ChatPage({ params: Promise.resolve({ id: "public-id" }) });
    renderToStaticMarkup(page);

    expect(chatHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOwner: true }),
      undefined,
    );
  });

  it("uses shared summaries with the active conversation context", async () => {
    const summaries = [{ id: 42, publicId: "public-id", title: "Measured chat" }];
    getConversationSummariesMock.mockResolvedValue(summaries);

    const page = await ChatPage({ params: Promise.resolve({ id: "public-id" }) });
    renderToStaticMarkup(page);

    expect(getConversationSummariesMock).toHaveBeenCalledWith({
      currentUserId: "user-1",
      activeConversationId: 42,
    });
    expect(chatSidebarMock).toHaveBeenCalledWith(
      expect.objectContaining({ chats: summaries }),
      undefined,
    );
  });

  it("shapes persisted AI messages with explicit provider identity", async () => {
    conversationFindUniqueMock.mockReset();
    conversationFindUniqueMock
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({
        id: 42,
        title: "Measured chat",
        members: [],
        messages: [{
          id: 8,
          authorType: "ai",
          authorId: "anthropic",
          content: "A persisted answer",
          createdAt: new Date("2026-08-27T00:00:00Z"),
          replyTo: null,
        }],
      });

    renderToStaticMarkup(
      await ChatPage({ params: Promise.resolve({ id: "public-id" }) })
    );

    expect(chatConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            authorType: "ai",
            authorName: "Claude",
            provider: "anthropic",
            participant: {
              id: "ai:anthropic",
              displayName: "Claude",
              type: "ai",
              providerId: "anthropic",
              avatarUrl: null,
              initials: "CL",
              isCurrentUser: false,
            },
          }),
        ],
      }),
      undefined,
    );
  });

  it("renders member access with isOwner=false", async () => {
    requireUserMock.mockResolvedValue({ id: "member-1", isGuest: false });

    const page = await ChatPage({ params: Promise.resolve({ id: "public-id" }) });
    renderToStaticMarkup(page);

    expect(chatHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOwner: false }),
      undefined,
    );
  });

  it("redirects a guest without access to their latest conversation", async () => {
    requireUserMock.mockResolvedValue({ id: "guest-1", isGuest: true });
    requireConversationAccessMock.mockRejectedValue(new Error("forbidden"));
    conversationMemberFindFirstMock.mockResolvedValue({
      conversation: { publicId: "guest-chat" },
    });

    await expect(
      ChatPage({ params: Promise.resolve({ id: "inaccessible-chat" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/chat/guest-chat");
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("returns notFound when a non-guest has no access", async () => {
    requireConversationAccessMock.mockRejectedValue(new Error("forbidden"));

    await expect(
      ChatPage({ params: Promise.resolve({ id: "inaccessible-chat" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns notFound for a genuinely nonexistent conversation", async () => {
    conversationFindUniqueMock.mockReset();
    conversationFindUniqueMock.mockResolvedValueOnce(null);

    await expect(
      ChatPage({ params: Promise.resolve({ id: "missing-chat" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(requireConversationAccessMock).not.toHaveBeenCalled();
  });
});
