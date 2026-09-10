import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  requireConversationAccessMock,
  getValidInviteMock,
  joinConversationMock,
  createInviteMock,
  updateInviteManyMock,
  deleteManyMock,
  findFirstMock,
  findUniqueMock,
  createClientMock,
  signInAnonymouslyMock,
  signOutMock,
  redirectMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireConversationAccessMock: vi.fn(),
  getValidInviteMock: vi.fn(),
  joinConversationMock: vi.fn(),
  createInviteMock: vi.fn(),
  updateInviteManyMock: vi.fn(),
  deleteManyMock: vi.fn(),
  findFirstMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createClientMock: vi.fn(),
  signInAnonymouslyMock: vi.fn(),
  signOutMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/auth/require-conversation-access", () => ({
  requireConversationAccess: requireConversationAccessMock,
}));

vi.mock("@/lib/invites/get-valid-invite", () => ({
  getValidInvite: getValidInviteMock,
}));

vi.mock("@/lib/invites/join-conversation", () => ({
  joinConversation: joinConversationMock,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversationInvite: {
      create: createInviteMock,
      updateMany: updateInviteManyMock,
    },
    conversationMember: {
      deleteMany: deleteManyMock,
    },
    conversation: {
      findFirst: findFirstMock,
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import {
  createConversationInvite,
  joinConversationAsGuest,
  leaveConversation,
  revokeConversationInvite,
} from "@/app/actions/invites";

describe("invite actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({
      auth: {
        signInAnonymously: signInAnonymouslyMock,
        signOut: signOutMock,
      },
    });
    createInviteMock.mockResolvedValue({ id: 5 });
    joinConversationMock.mockResolvedValue({
      conversationId: 42,
      joined: true,
    });
    signOutMock.mockResolvedValue({
      error: null,
    });
  });

  it("rejects invite creation when the user is not the owner", async () => {
    requireUserMock.mockResolvedValue({
      id: "user-2",
    });

    requireConversationAccessMock.mockResolvedValue({
      id: 42,
      ownerId: "user-1",
    });

    await expect(
      createConversationInvite(42)
    ).rejects.toThrow(
      "Only the conversation owner can create invites."
    );

    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("rejects an empty guest display name", async () => {
    await expect(
      joinConversationAsGuest("token-1", "   ")
    ).rejects.toThrow("Display name is required.");

    expect(getValidInviteMock).not.toHaveBeenCalled();
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });

  it("rejects a guest display name longer than 50 characters", async () => {
    await expect(
      joinConversationAsGuest(
        "token-1",
        "a".repeat(51)
      )
    ).rejects.toThrow("Display name is too long.");

    expect(getValidInviteMock).not.toHaveBeenCalled();
  });

  it("creates a guest user and joins the invited conversation", async () => {
    getValidInviteMock.mockResolvedValue({
      conversationId: 42,
    });

    signInAnonymouslyMock.mockResolvedValue({
      data: {
        user: {
          id: "guest-1",
        },
      },
      error: null,
    });

    findUniqueMock.mockResolvedValue({
      publicId: "conversation-public-id",
    });

    const result = await joinConversationAsGuest(
      "token-1",
      " Guest User "
    );

    expect(signInAnonymouslyMock).toHaveBeenCalledWith({
      options: {
        data: {
          name: "Guest User",
        },
      },
    });

    expect(joinConversationMock).toHaveBeenCalledWith({
      token: "token-1",
      userId: "guest-1",
      guestName: "Guest User",
    });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: {
        id: 42,
      },
      select: {
        publicId: true,
      },
    });

    expect(result).toEqual({
      conversationId: 42,
      conversationPublicId:
        "conversation-public-id",
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("does not allow the owner to leave the conversation", async () => {
    requireUserMock.mockResolvedValue({
      id: "user-1",
      isGuest: false,
    });

    requireConversationAccessMock.mockResolvedValue({
      id: 42,
      ownerId: "user-1",
    });

    await expect(
      leaveConversation(42)
    ).rejects.toThrow(
      "The conversation owner cannot leave."
    );

    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("does not create a guest identity when an invite is unavailable", async () => {
    getValidInviteMock.mockRejectedValue(
      new Error("Invite usage limit reached.")
    );

    await expect(
      joinConversationAsGuest("full-token", "Guest")
    ).rejects.toThrow("Invite usage limit reached.");

    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    expect(joinConversationMock).not.toHaveBeenCalled();
  });

  it("allows only the owner to revoke an invite", async () => {
    requireUserMock.mockResolvedValue({ id: "member-1" });
    updateInviteManyMock.mockResolvedValue({ count: 0 });

    await expect(revokeConversationInvite(5)).rejects.toThrow(
      "Invite not found."
    );

    requireUserMock.mockResolvedValue({ id: "owner-1" });
    updateInviteManyMock.mockResolvedValue({ count: 1 });
    await revokeConversationInvite(5);

    expect(updateInviteManyMock).toHaveBeenLastCalledWith({
      where: {
        id: 5,
        revokedAt: null,
        conversation: { ownerId: "owner-1" },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("allows a member to leave the conversation", async () => {
    requireUserMock.mockResolvedValue({
      id: "member-1",
      isGuest: false,
    });
    requireConversationAccessMock.mockResolvedValue({
      id: 42,
      ownerId: "owner-1",
    });
    deleteManyMock.mockResolvedValue({ count: 1 });
    findFirstMock.mockResolvedValue({
      id: 7,
      publicId: "next-conversation",
    });

    const result = await leaveConversation(42);

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        conversationId: 42,
        userId: "member-1",
      },
    });
    expect(result).toEqual({
      nextConversationId: 7,
      nextConversationPublicId: "next-conversation",
      signedOut: false,
    });
  });

  it("signs out a guest after leaving their last conversation", async () => {
    requireUserMock.mockResolvedValue({
      id: "guest-1",
      isGuest: true,
    });

    requireConversationAccessMock.mockResolvedValue({
      id: 42,
      ownerId: "user-1",
    });

    deleteManyMock.mockResolvedValue({
      count: 1,
    });

    findFirstMock.mockResolvedValue(null);

    signOutMock.mockResolvedValue({
      error: null,
    });

    const result = await leaveConversation(42);

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        conversationId: 42,
        userId: "guest-1",
      },
    });

    expect(signOutMock).toHaveBeenCalled();

    expect(result).toEqual({
      nextConversationId: null,
      nextConversationPublicId: null,
      signedOut: true,
    });
  });

  it("signs out best-effort when joining fails after guest creation", async () => {
    const joinError = new Error("Invite filled concurrently.");
    getValidInviteMock.mockResolvedValue({ conversationId: 42 });
    signInAnonymouslyMock.mockResolvedValue({
      data: { user: { id: "guest-failed" } },
      error: null,
    });
    joinConversationMock.mockRejectedValue(joinError);

    await expect(
      joinConversationAsGuest("token-1", "Guest")
    ).rejects.toBe(joinError);

    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("does not sign out when guest creation fails before a session exists", async () => {
    getValidInviteMock.mockResolvedValue({ conversationId: 42 });
    signInAnonymouslyMock.mockResolvedValue({
      data: { user: null },
      error: new Error("Guest creation failed."),
    });

    await expect(
      joinConversationAsGuest("token-1", "Guest")
    ).rejects.toThrow("Guest creation failed.");

    expect(joinConversationMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("preserves the join error when guest sign-out also fails", async () => {
    const joinError = new Error("Original join failure.");
    getValidInviteMock.mockResolvedValue({ conversationId: 42 });
    signInAnonymouslyMock.mockResolvedValue({
      data: { user: { id: "guest-failed" } },
      error: null,
    });
    joinConversationMock.mockRejectedValue(joinError);
    signOutMock.mockRejectedValue(new Error("Cleanup failure."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      joinConversationAsGuest("token-1", "Guest")
    ).rejects.toBe(joinError);

    expect(signOutMock).toHaveBeenCalledOnce();
  });
});
