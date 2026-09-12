import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSettingsAccessMock, userUpdateMock } = vi.hoisted(() => ({
  requireSettingsAccessMock: vi.fn(),
  userUpdateMock: vi.fn(),
}));

vi.mock("@/lib/auth/settings-access", () => ({
  requireSettingsAccess: requireSettingsAccessMock,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { update: userUpdateMock } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateDisplayName } from "@/app/actions/profile";

describe("profile Settings capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows an authorized Settings user", async () => {
    requireSettingsAccessMock.mockResolvedValue({ id: "owner-1" });
    const formData = new FormData();
    formData.set("displayName", "Owner");

    await updateDisplayName(formData);

    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { name: "Owner" },
    });
  });

  it("denies direct membership-only profile mutation", async () => {
    requireSettingsAccessMock.mockRejectedValue(
      new Error("You do not have access to Settings.")
    );

    await expect(updateDisplayName(new FormData())).rejects.toThrow(
      "You do not have access to Settings."
    );
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
