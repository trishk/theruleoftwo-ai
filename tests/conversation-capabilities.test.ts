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
  updateMemberAiUsage,
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

  it.each([
    ["member", { id: "member-1", isGuest: false }],
    ["guest", { id: "guest-1", isGuest: true }],
  ])("prevents a %s from renaming a conversation", async (_role, actor) => {
    requireUserMock.mockResolvedValue(actor);
    conversationFindUniqueMock.mockResolvedValue({
      updatedAt: new Date("2026-08-27T10:00:00.000Z"),
    });
    conversationUpdateMock.mockResolvedValue({ id: 42 });

    await expect(
      renameConversation(42, "Shared title")
    ).rejects.toThrow("Only the conversation owner can rename it.");

    expect(conversationUpdateMock).not.toHaveBeenCalled();
  });

  it("allows the owner to rename a conversation", async () => {
    requireUserMock.mockResolvedValue({ id: "owner-1", isGuest: false });
    const updatedAt = new Date("2026-08-27T10:00:00.000Z");
    conversationFindUniqueMock.mockResolvedValue({ updatedAt });

    await renameConversation(42, "  Owner title  ");

    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { title: "Owner title", updatedAt },
    });
  });

  it("allows only the owner to change shared AI usage", async () => {
    await expect(updateMemberAiUsage(42, true)).rejects.toThrow(
      "Only the conversation owner can change AI sharing."
    );
    expect(conversationUpdateMock).not.toHaveBeenCalled();

    requireUserMock.mockResolvedValue({ id: "owner-1", isGuest: false });
    await updateMemberAiUsage(42, true);

    expect(conversationUpdateMock).toHaveBeenCalledWith({
      where: { id: 42, ownerId: "owner-1" },
      data: { allowMemberAiUsage: true },
    });
  });

  it("validates shared AI usage input server-side", async () => {
    requireUserMock.mockResolvedValue({ id: "owner-1", isGuest: false });

    await expect(
      updateMemberAiUsage(42, "yes" as never)
    ).rejects.toThrow("Invalid conversation capability input.");

    expect(requireConversationAccessMock).not.toHaveBeenCalled();
  });
});
