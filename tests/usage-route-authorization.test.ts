import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireUserMock, accessMock, usageMock } = vi.hoisted(() => ({ requireUserMock: vi.fn(), accessMock: vi.fn(), usageMock: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/auth/require-conversation-access", () => ({ requireConversationAccess: accessMock }));
vi.mock("@/lib/llm/usage/conversation-usage", () => ({ getConversationUsage: usageMock }));
import { GET } from "@/app/api/chat/usage/route";

describe("usage endpoint authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); requireUserMock.mockResolvedValue({ id: "owner" }); usageMock.mockResolvedValue({ summary: {}, breakdown: [] }); });
  it("returns owner usage after access and owner checks", async () => { accessMock.mockResolvedValue({ ownerId: "owner" }); const response = await GET(new Request("http://local/api/chat/usage?conversationId=7")); expect(response.status).toBe(200); expect(usageMock).toHaveBeenCalledWith(7); });
  it("returns the same 404 and skips usage for a member", async () => { accessMock.mockResolvedValue({ ownerId: "someone-else" }); const response = await GET(new Request("http://local/api/chat/usage?conversationId=7")); expect(response.status).toBe(404); expect(usageMock).not.toHaveBeenCalled(); });
  it("returns the same 404 and skips usage without conversation access", async () => { accessMock.mockRejectedValue(new Error("missing")); const response = await GET(new Request("http://local/api/chat/usage?conversationId=7")); expect(response.status).toBe(404); expect(usageMock).not.toHaveBeenCalled(); });
});
