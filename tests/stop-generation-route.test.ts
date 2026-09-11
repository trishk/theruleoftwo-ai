import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAccess: vi.fn(),
  findAttempt: vi.fn(),
  stopAttempt: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/require-conversation-access", () => ({ requireConversationAccess: mocks.requireAccess }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { aiGenerationAttempt: { findUnique: mocks.findAttempt } } }));
vi.mock("@/lib/chat-stream/generation-lifecycle", () => ({ stopAttempt: mocks.stopAttempt }));

import { POST } from "@/app/api/chat/stop/route";

const request = () => new Request("http://localhost/api/chat/stop", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: "attempt-1" }),
});

describe("stop generation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.requireAccess.mockResolvedValue({ ownerId: "user-1", allowMemberAiUsage: false });
    mocks.findAttempt.mockResolvedValue({ requesterId: "user-1", generation: { conversationId: 1, sourceMessage: { authorType: "human", authorId: "user-1" } } });
    mocks.stopAttempt.mockResolvedValue("stopped");
  });

  it("authorizes ownership before durably stopping", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledWith(1, "user-1");
    expect(mocks.stopAttempt).toHaveBeenCalledWith("attempt-1");
  });

  it("does not disclose or stop another requester's attempt", async () => {
    mocks.findAttempt.mockResolvedValue({ requesterId: "other", generation: { conversationId: 1, sourceMessage: { authorType: "human", authorId: "other" } } });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.stopAttempt).not.toHaveBeenCalled();
  });

  it("checks current AI-sharing capability before stopping", async () => {
    mocks.requireAccess.mockResolvedValue({ ownerId: "owner", allowMemberAiUsage: false });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.stopAttempt).not.toHaveBeenCalled();
  });
});
