import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  requireUserMock,
  findFirstMock,
  redirectMock,
  getConversationSummariesMock,
  chatSidebarMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  findFirstMock: vi.fn(),
  redirectMock: vi.fn(),
  getConversationSummariesMock: vi.fn(),
  chatSidebarMock: vi.fn(() => null),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversationMember: {
      findFirst: findFirstMock,
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/chat/get-conversation-summaries", () => ({
  getConversationSummaries: getConversationSummariesMock,
}));

vi.mock("@/components/chat/navigation/ChatHeader", () => ({
  ChatHeader: () => null,
}));

vi.mock("@/components/chat/navigation/ChatShell", () => ({
  ChatShell: ({ sidebar }: { sidebar: unknown }) => sidebar,
}));

vi.mock("@/components/chat/navigation/ChatSidebar", () => ({
  ChatSidebar: chatSidebarMock,
}));

import Home from "@/app/page";

describe("home page guest navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationSummariesMock.mockResolvedValue([]);

    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("redirects a guest to the conversation public ID", async () => {
    requireUserMock.mockResolvedValue({
      id: "guest-1",
      isGuest: true,
    });

    findFirstMock.mockResolvedValue({
      conversationId: 42,
      conversation: {
        publicId: "conversation-public-id",
      },
    });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        userId: "guest-1",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        conversation: {
          select: {
            publicId: true,
          },
        },
      },
    });
    expect(redirectMock).toHaveBeenCalledWith(
      "/chat/conversation-public-id"
    );
    expect(redirectMock).not.toHaveBeenCalledWith("/chat/42");
  });

  it("uses the shared conversation summary loader", async () => {
    const summaries = [{ id: 1, publicId: "one", title: "One" }];
    requireUserMock.mockResolvedValue({ id: "user-1", isGuest: false });
    getConversationSummariesMock.mockResolvedValue(summaries);

    renderToStaticMarkup(await Home());

    expect(getConversationSummariesMock).toHaveBeenCalledWith({
      currentUserId: "user-1",
      activeConversationId: null,
    });
    expect(chatSidebarMock).toHaveBeenCalledWith(
      expect.objectContaining({ chats: summaries }),
      undefined,
    );
  });
});
