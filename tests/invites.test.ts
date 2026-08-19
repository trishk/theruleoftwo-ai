import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  requireConversationAccessMock,
  getValidInviteMock,
  joinConversationMock,
  createInviteMock,
  userUpsertMock,
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
  userUpsertMock: vi.fn(),
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
    },
    user: {
      upsert: userUpsertMock,
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

    userUpsertMock.mockResolvedValue({
      id: "guest-1",
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

    expect(userUpsertMock).toHaveBeenCalledWith({
      where: {
        id: "guest-1",
      },
      update: {
        name: "Guest User",
      },
      create: {
        id: "guest-1",
        name: "Guest User",
      },
    });

    expect(joinConversationMock).toHaveBeenCalledWith({
      conversationId: 42,
      userId: "guest-1",
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
});