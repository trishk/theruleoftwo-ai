import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUserMock, conversationFindManyMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  conversationFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: { findMany: conversationFindManyMock },
  },
}));

import {
  canAccessSettings,
  requireSettingsAccess,
} from "@/lib/auth/settings-access";

describe("Settings capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({
      id: "user-1",
      isGuest: false,
    });
  });

  it("allows owners, including mixed owner/member accounts", () => {
    expect(canAccessSettings({
      userId: "user-1",
      isGuest: false,
      conversations: [
        { ownerId: "someone-else" },
        { ownerId: "user-1" },
      ],
    })).toBe(true);
  });

  it("allows brand-new authenticated accounts", () => {
    expect(canAccessSettings({
      userId: "user-1",
      isGuest: false,
      conversations: [],
    })).toBe(true);
  });

  it("denies membership-only accounts and guests", () => {
    expect(canAccessSettings({
      userId: "user-1",
      isGuest: false,
      conversations: [{ ownerId: "owner-1" }],
    })).toBe(false);
    expect(canAccessSettings({
      userId: "guest-1",
      isGuest: true,
      conversations: [],
    })).toBe(false);
  });

  it("derives enforcement identity from the authenticated session", async () => {
    conversationFindManyMock.mockResolvedValue([
      { ownerId: "user-1" },
    ]);

    await expect(requireSettingsAccess()).resolves.toMatchObject({
      id: "user-1",
    });
    expect(conversationFindManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerId: "user-1" },
          { members: { some: { userId: "user-1" } } },
        ],
      },
      select: { ownerId: true },
    });
  });

  it("rejects a membership-only authenticated session", async () => {
    conversationFindManyMock.mockResolvedValue([
      { ownerId: "owner-1" },
    ]);

    await expect(requireSettingsAccess()).rejects.toThrow(
      "You do not have access to Settings."
    );
  });
});
