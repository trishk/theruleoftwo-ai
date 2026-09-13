// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkRateLimitMock, redeemPairingTokenMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  redeemPairingTokenMock: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/personal-agent/pairing", () => ({ redeemPairingToken: redeemPairingTokenMock }));

import { createPairingCredential } from "@/lib/personal-agent/credentials";
import { POST } from "@/app/api/personal-agent/pair/route";

describe("personal-agent pairing route rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    redeemPairingTokenMock.mockResolvedValue({
      agentId: "00000000-0000-4000-8000-000000000001",
      agentCredential: "returned-once",
    });
  });

  it("uses only the pairing-token bucket and no deployment-wide bucket", async () => {
    const token = createPairingCredential();
    const response = await POST(new Request("http://localhost/api/personal-agent/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingToken: token.credential }),
    }));

    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    expect(checkRateLimitMock).toHaveBeenCalledWith(`personal-agent-pair:${token.id}`);
    expect(checkRateLimitMock).not.toHaveBeenCalledWith("personal-agent-pair:global");
  });
});
