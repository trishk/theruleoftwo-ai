import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getUserMock,
  upsertMock,
  redirectMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
  upsertMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      upsert: upsertMock,
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import {
  getCurrentUser,
  requireUser,
} from "@/lib/auth/require-user";

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: getUserMock,
      },
    });
  });

  it("returns null when Supabase has no authenticated user", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toBeNull();

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts and returns the authenticated user", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "user@example.com",
          is_anonymous: false,
          user_metadata: {
            full_name: "Test User",
            avatar_url: "https://example.com/avatar.png",
          },
        },
      },
      error: null,
    });

    const appUser = {
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    };

    upsertMock.mockResolvedValue(appUser);

    const result = await getCurrentUser();

    expect(upsertMock).toHaveBeenCalledWith({
      where: {
        id: "user-1",
      },
      update: {
        email: "user@example.com",
        avatarUrl: "https://example.com/avatar.png",
      },
      create: {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
        avatarUrl: "https://example.com/avatar.png",
      },
    });

    expect(result).toEqual({
      ...appUser,
      isGuest: false,
    });
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: getUserMock,
      },
    });
  });

  it("redirects to login when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
    });

    await requireUser();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});