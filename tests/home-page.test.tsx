import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  findFirstMock,
  redirectMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  findFirstMock: vi.fn(),
  redirectMock: vi.fn(),
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

vi.mock("@/components/chat/navigation/ChatHeader", () => ({
  ChatHeader: () => null,
}));

vi.mock("@/components/chat/navigation/ChatShell", () => ({
  ChatShell: () => null,
}));

vi.mock("@/components/chat/navigation/ChatSidebar", () => ({
  ChatSidebar: () => null,
}));

import Home from "@/app/page";

describe("home page guest navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
});
