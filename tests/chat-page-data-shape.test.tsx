import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  requireUserMock,
  requireConversationAccessMock,
  markConversationReadMock,
  conversationFindUniqueMock,
  conversationFindManyMock,
  integrationFindManyMock,
  userFindManyMock,
  conversationMemberFindFirstMock,
  notFoundMock,
  redirectMock,
  chatHeaderMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireConversationAccessMock: vi.fn(),
  markConversationReadMock: vi.fn(),
  conversationFindUniqueMock: vi.fn(),
  conversationFindManyMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  conversationMemberFindFirstMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirectMock: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
  chatHeaderMock: vi.fn(() => null),
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

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: conversationFindUniqueMock,
      findMany: conversationFindManyMock,
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
vi.mock("@/components/chat/conversation/ChatConversation", () => ({ ChatConversation: () => null }));
vi.mock("@/components/chat/navigation/ChatShell", () => ({
  ChatShell: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/chat/navigation/ChatSidebar", () => ({ ChatSidebar: () => null }));
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
    conversationFindManyMock.mockResolvedValue([]);
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
        members: { select: { user: { select: { name: true } } } },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorType: true,
            authorId: true,
            content: true,
            createdAt: true,
            replyTo: { select: { id: true, authorId: true, content: true } },
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
