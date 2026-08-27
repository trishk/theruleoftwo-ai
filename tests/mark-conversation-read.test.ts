import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  requireConversationAccessMock,
  readStateUpsertMock,
} = vi.hoisted(() => ({
  requireConversationAccessMock:
    vi.fn(),
  readStateUpsertMock: vi.fn(),
}));

vi.mock(
  "@/lib/auth/require-conversation-access",
  () => ({
    requireConversationAccess:
      requireConversationAccessMock,
  })
);

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversationReadState: {
      upsert: readStateUpsertMock,
    },
  },
}));

import {
  markConversationRead,
  markConversationReadAfterAccessCheck,
} from "@/lib/conversations/mark-conversation-read";

describe("markConversationRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireConversationAccessMock.mockResolvedValue(
      {
        id: 42,
      }
    );

    readStateUpsertMock.mockResolvedValue(
      {}
    );
  });

  it("authorizes public callers before writing read state", async () => {
    await markConversationRead({
      conversationId: 42,
      userId: "user-1",
    });

    expect(
      requireConversationAccessMock
    ).toHaveBeenCalledWith(
      42,
      "user-1"
    );

    expect(
      readStateUpsertMock
    ).toHaveBeenCalledTimes(1);
  });

  it("does not let an unauthorized public caller write read state", async () => {
    requireConversationAccessMock.mockRejectedValue(
      new Error(
        "Conversation not found."
      )
    );

    await expect(
      markConversationRead({
        conversationId: 42,
        userId: "user-2",
      })
    ).rejects.toThrow(
      "Conversation not found."
    );

    expect(
      readStateUpsertMock
    ).not.toHaveBeenCalled();
  });

  it("lets an already-authorized internal caller write without a duplicate access query", async () => {
    await markConversationReadAfterAccessCheck(
      {
        conversationId: 42,
        userId: "user-1",
      }
    );

    expect(
      requireConversationAccessMock
    ).not.toHaveBeenCalled();

    expect(
      readStateUpsertMock
    ).toHaveBeenCalledTimes(1);
  });
});
