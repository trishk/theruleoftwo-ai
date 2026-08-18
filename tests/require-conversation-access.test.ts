import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: findFirstMock,
    },
  },
}));

import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

describe("requireConversationAccess", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("returns the conversation when the user has access", async () => {
    const conversation = {
      id: 42,
      ownerId: "user-1",
      owner: {
        name: "Tudor",
      },
    };

    findFirstMock.mockResolvedValue(conversation);

    const result = await requireConversationAccess(42, "user-1");

    expect(result).toEqual(conversation);

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        id: 42,
        OR: [
          {
            ownerId: "user-1",
          },
          {
            members: {
              some: {
                userId: "user-1",
              },
            },
          },
        ],
      },
      select: {
        id: true,
        ownerId: true,
        owner: {
          select: {
            name: true,
          },
        },
      },
    });
  });

  it("throws when the user does not have access", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(
      requireConversationAccess(42, "user-2")
    ).rejects.toThrow("Conversation not found.");
  });
});