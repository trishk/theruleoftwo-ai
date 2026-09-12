import { beforeEach, describe, expect, it, vi } from "vitest";

const { accessMock, messageFindFirstMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  messageFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-conversation-access", () => ({
  requireConversationAccess: accessMock,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    message: {
      findFirst: messageFindFirstMock,
    },
  },
}));

import { validateStreamRequest } from "@/lib/chat-stream/validate-stream-request";

const body = {
  conversationId: 42,
  messageId: 7,
  provider: "openai",
};

describe("stream conversation capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageFindFirstMock.mockResolvedValue({
      content: "@chatgpt help",
    });
  });

  it("allows the owner when shared AI usage is disabled", async () => {
    accessMock.mockResolvedValue({
      id: 42,
      ownerId: "owner-1",
      allowMemberAiUsage: false,
    });

    await expect(
      validateStreamRequest({ rawBody: body, userId: "owner-1" })
    ).resolves.toMatchObject({ ownerId: "owner-1" });
  });

  it.each(["member-1", "guest-1"])(
    "rejects %s before reading the source message when sharing is disabled",
    async (userId) => {
      accessMock.mockResolvedValue({
        id: 42,
        ownerId: "owner-1",
        allowMemberAiUsage: false,
      });

      await expect(
        validateStreamRequest({ rawBody: body, userId })
      ).rejects.toThrow("MEMBER_AI_USAGE_NOT_ALLOWED");

      expect(messageFindFirstMock).not.toHaveBeenCalled();
    }
  );

  it.each(["member-1", "guest-1"])(
    "allows %s when the owner enabled sharing",
    async (userId) => {
      accessMock.mockResolvedValue({
        id: 42,
        ownerId: "owner-1",
        allowMemberAiUsage: true,
      });

      await expect(
        validateStreamRequest({ rawBody: body, userId })
      ).resolves.toMatchObject({ ownerId: "owner-1" });
    }
  );

  it("rejects a provider that is not mentioned by the persisted source message", async () => {
    accessMock.mockResolvedValue({
      id: 42,
      ownerId: "owner-1",
      allowMemberAiUsage: true,
    });
    messageFindFirstMock.mockResolvedValue({ content: "@claude help" });

    await expect(
      validateStreamRequest({ rawBody: body, userId: "owner-1" })
    ).rejects.toThrow("PROVIDER_NOT_MENTIONED");
  });
});
