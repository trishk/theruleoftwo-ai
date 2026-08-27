import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  upsertMock,
  updateManyMock,
  encryptSecretMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  upsertMock: vi.fn(),
  updateManyMock: vi.fn(),
  encryptSecretMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userIntegration: {
      upsert: upsertMock,
      updateMany: updateManyMock,
    },
  },
}));
vi.mock("@/lib/security/encryption", () => ({
  encryptSecret: encryptSecretMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  removeIntegration,
  saveIntegrationApiKey,
  updateSelectedModel,
} from "@/app/actions/integrations";

describe("integration capability boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "user-1", isGuest: false });
    encryptSecretMock.mockReturnValue({
      encrypted: "ciphertext",
      iv: "iv",
      authTag: "tag",
    });
  });

  it("scopes integration writes to the authenticated user", async () => {
    await saveIntegrationApiKey("openai", "test-api-key");
    await updateSelectedModel("openai", "gpt-5");
    await removeIntegration("openai");

    expect(upsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId_provider: { userId: "user-1", provider: "openai" } },
        create: expect.objectContaining({ userId: "user-1", provider: "openai" }),
      })
    );
    expect(upsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId_provider: { userId: "user-1", provider: "openai" } },
        create: expect.objectContaining({ userId: "user-1", provider: "openai" }),
      })
    );
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", provider: "openai" },
      })
    );
  });

  it.each([
    ["save API key", () => saveIntegrationApiKey("openai", "test-api-key")],
    ["select model", () => updateSelectedModel("openai", "gpt-5")],
    ["remove integration", () => removeIntegration("openai")],
  ])("prevents a guest from attempting to %s", async (_label, action) => {
    requireUserMock.mockResolvedValue({ id: "guest-1", isGuest: true });

    await expect(action()).rejects.toThrow(
      "Guests cannot modify integrations."
    );

    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(encryptSecretMock).not.toHaveBeenCalled();
  });
});
