import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  requireConversationAccessMock,
  conversationFindUniqueMock,
  conversationUpdateMock,
  conversationDeleteMock,
  revalidatePathMock,
  redirectMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireConversationAccessMock: vi.fn(),
  conversationFindUniqueMock: vi.fn(),
  conversationUpdateMock: vi.fn(),
  conversationDeleteMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/auth/require-conversation-access", () => ({
  requireConversationAccess: requireConversationAccessMock,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: conversationFindUniqueMock,
      update: conversationUpdateMock,
      delete: conversationDeleteMock,
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import {
  deleteConversation,
  renameConversation,
} from "@/app/actions/conversations";

describe("conversation capability boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "member-1", isGuest: false });
    requireConversationAccessMock.mockResolvedValue({
      id: 42,
      ownerId: "owner-1",
    });
  });

  it("prevents a member from deleting a conversation", async () => {
    await expect(deleteConversation(42)).rejects.toThrow(
      "Only the conversation owner can delete it."
    );

    expect(conversationDeleteMock).not.toHaveBeenCalled();
  });

  it("allows a member to rename a conversation", async () => {
    const updatedAt = new Date("2026-08-27T10:00:00.000Z");
    conversationFindUniqueMock.mockResolvedValue({ updatedAt });
    conversationUpdateMock.mockResolvedValue({ id: 42 });

    await renameConversation(42, "  Shared title  ");

    expect(requireConversationAccessMock).toHaveBeenCalledWith(42, "member-1");
    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        title: "Shared title",
        updatedAt,
      },
    });
  });
});
