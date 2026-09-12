// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isSafeE2EMode: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/llm/e2e-mode", () => ({
  isSafeE2EMode: mocks.isSafeE2EMode,
}));

import { POST } from "@/app/auth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: {
      verifyOtp: mocks.verifyOtp,
    },
  });
  mocks.verifyOtp.mockResolvedValue({
    error: null,
  });
});

describe("E2E auth callback", () => {
  it("fails closed outside the guarded E2E environment", async () => {
    mocks.isSafeE2EMode.mockReturnValue(false);

    const response = await POST(
      new Request("http://127.0.0.1:3000/auth/callback", {
        method: "POST",
        body: JSON.stringify({
          tokenHash: "test-token-hash",
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies the generated magic-link token in guarded E2E mode", async () => {
    mocks.isSafeE2EMode.mockReturnValue(true);

    const response = await POST(
      new Request("http://127.0.0.1:3000/auth/callback", {
        method: "POST",
        body: JSON.stringify({
          tokenHash: "test-token-hash",
        }),
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "test-token-hash",
      type: "magiclink",
    });
  });
});
