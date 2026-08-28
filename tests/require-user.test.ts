import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), findUnique: vi.fn(),
  update: vi.fn(), upsert: vi.fn(), redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: {
  findUnique: mocks.findUnique, update: mocks.update, upsert: mocks.upsert,
} } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { getCurrentUser, requireUser } from "@/lib/auth/require-user";

const timestamps = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02") };
const authUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1", email: "user@example.com", is_anonymous: false,
  user_metadata: { full_name: "Test User", avatar_url: "https://example.com/avatar.png" },
  ...overrides,
});
const localUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1", email: "user@example.com", name: "Test User",
  avatarUrl: "https://example.com/avatar.png", ...timestamps, ...overrides,
});
const authenticate = (user: ReturnType<typeof authUser> | null) =>
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("returns null without querying Prisma when Supabase has no authenticated user", async () => {
    authenticate(null);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns an unchanged existing user without a database write", async () => {
    authenticate(authUser());
    const existing = localUser();
    mocks.findUnique.mockResolvedValue(existing);
    await expect(getCurrentUser()).resolves.toEqual({ ...existing, isGuest: false });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("preserves an existing application-owned display name without a write", async () => {
    authenticate(authUser({ user_metadata: {
      full_name: "Google Name", avatar_url: "https://example.com/avatar.png",
    } }));
    const existing = localUser({ name: "Custom Display Name" });
    mocks.findUnique.mockResolvedValue(existing);
    await expect(getCurrentUser()).resolves.toEqual({ ...existing, isGuest: false });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("updates changed email and avatar without overwriting the local display name", async () => {
    authenticate(authUser({ email: "new@example.com", user_metadata: {
      full_name: "Google Name", avatar_url: "https://example.com/new.png",
    } }));
    mocks.findUnique.mockResolvedValue(localUser({ name: "Custom Display Name" }));
    const updated = localUser({
      email: "new@example.com",
      name: "Custom Display Name",
      avatarUrl: "https://example.com/new.png",
    });
    mocks.update.mockResolvedValue(updated);
    await expect(getCurrentUser()).resolves.toEqual({ ...updated, isGuest: false });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: {
      email: "new@example.com", avatarUrl: "https://example.com/new.png",
    } });
  });

  it("safely upserts a missing user", async () => {
    authenticate(authUser());
    mocks.findUnique.mockResolvedValue(null);
    const created = localUser();
    mocks.upsert.mockResolvedValue(created);
    await expect(getCurrentUser()).resolves.toEqual({ ...created, isGuest: false });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { id: "user-1" },
      update: { email: "user@example.com", avatarUrl: "https://example.com/avatar.png" },
      create: { id: "user-1", email: "user@example.com", name: "Test User", avatarUrl: "https://example.com/avatar.png" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves the existing name when optional metadata is missing without repeated writes", async () => {
    authenticate(authUser({ email: undefined, user_metadata: {} }));
    const stale = localUser({ email: "old@example.com", name: "Old", avatarUrl: "old.png" });
    const settled = localUser({ email: null, name: "Old", avatarUrl: null });
    mocks.findUnique.mockResolvedValueOnce(stale).mockResolvedValueOnce(settled);
    mocks.update.mockResolvedValue(settled);
    await expect(getCurrentUser()).resolves.toMatchObject({ email: null, name: "Old", avatarUrl: null });
    await expect(getCurrentUser()).resolves.toMatchObject({ email: null, name: "Old", avatarUrl: null });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" }, data: { email: null, avatarUrl: null },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("uses each authenticated id for concurrent lookups", async () => {
    mocks.getUser
      .mockResolvedValueOnce({ data: { user: authUser({ id: "user-1" }) }, error: null })
      .mockResolvedValueOnce({ data: { user: authUser({ id: "user-2" }) }, error: null });
    mocks.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(localUser({ id: where.id })));
    const [first, second] = await Promise.all([getCurrentUser(), getCurrentUser()]);
    expect([first?.id, second?.id]).toEqual(["user-1", "user-2"]);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "user-2" } });
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });
  it("redirects to login when there is no authenticated user", async () => {
    authenticate(null);
    await requireUser();
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
