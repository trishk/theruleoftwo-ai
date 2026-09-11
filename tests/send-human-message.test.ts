import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  requireUserMock,
  requireConversationAccessMock,
  revalidatePathMock,
  conversationFindUniqueMock,
  conversationUpdateMock,
  messageCountMock,
  messageCreateMock,
  messageFindFirstMock,
  messageFindUniqueMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireConversationAccessMock:
    vi.fn(),
  revalidatePathMock: vi.fn(),
  conversationFindUniqueMock:
    vi.fn(),
  conversationUpdateMock:
    vi.fn(),
  messageCountMock: vi.fn(),
  messageCreateMock: vi.fn(),
  messageFindFirstMock: vi.fn(),
  messageFindUniqueMock: vi.fn(),
}));

vi.mock(
  "@/lib/auth/require-user",
  () => ({
    requireUser: requireUserMock,
  })
);

vi.mock(
  "@/lib/auth/require-conversation-access",
  () => ({
    requireConversationAccess:
      requireConversationAccessMock,
  })
);

vi.mock(
  "next/cache",
  () => ({
    revalidatePath:
      revalidatePathMock,
  })
);

vi.mock(
  "@/lib/db/prisma",
  () => ({
    prisma: {
      conversation: {
        findUnique:
          conversationFindUniqueMock,
        update:
          conversationUpdateMock,
      },
      message: {
        count:
          messageCountMock,
        create:
          messageCreateMock,
        findFirst:
          messageFindFirstMock,
        findUnique:
          messageFindUniqueMock,
      },
    },
  })
);

import { sendHumanMessage } from "@/app/actions/messages";

const CLIENT_MESSAGE_ID = "123e4567-e89b-42d3-a456-426614174000";

describe(
  "sendHumanMessage",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      requireUserMock.mockResolvedValue({
        id: "user-1",
      });

      requireConversationAccessMock.mockResolvedValue(
        undefined
      );

      conversationFindUniqueMock.mockResolvedValue(
        {
          title:
            "Existing Chat",
        }
      );

      messageCountMock.mockResolvedValue(
        1
      );

      messageCreateMock.mockResolvedValue(
        {
          id: 123,
        }
      );

      conversationUpdateMock.mockResolvedValue(
        {}
      );

      messageFindFirstMock.mockResolvedValue(
        {
          id: 999,
        }
      );
    });

    it(
      "persists the human message without invalidating the active chat layout",
      async () => {
        const result =
          await sendHumanMessage(
            42,
            "@chatgpt hello",
            null,
            CLIENT_MESSAGE_ID
          );

        expect(
          messageCreateMock
        ).toHaveBeenCalledWith({
          data: {
            conversationId: 42,
            authorType:
              "human",
            authorId:
              "user-1",
            content:
              "@chatgpt hello",
            replyToId: null,
            clientMessageId: CLIENT_MESSAGE_ID,
            clientPayloadHash: expect.any(String),
          },
        });

        expect(result).toEqual({
          outcome: "created",
          messageId: 123,
          clientMessageId: CLIENT_MESSAGE_ID,
          providers: [
            "openai",
          ],
        });

        expect(
          revalidatePathMock
        ).not.toHaveBeenCalledWith(
          "/chat",
          "layout"
        );

        expect(
          messageCountMock
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "counts messages and generates the title for the first message in a new chat",
      async () => {
        conversationFindUniqueMock.mockResolvedValue(
          {
            title: "New Chat",
          }
        );

        messageCountMock.mockResolvedValue(
          0
        );

        await sendHumanMessage(
          42,
          "@chatgpt First decision",
          null,
          CLIENT_MESSAGE_ID
        );

        expect(
          messageCountMock
        ).toHaveBeenCalledTimes(1);

        expect(
          conversationUpdateMock
        ).toHaveBeenNthCalledWith(
          1,
          {
            where: {
              id: 42,
            },
            data: {
              title: "First decision",
            },
          }
        );

        expect(
          conversationUpdateMock
        ).toHaveBeenCalledTimes(2);
      }
    );

    it.each([
      ["@chatgpt", "New conversation"],
      ["@chatgpt @claude", "New conversation"],
      [" @chatgpt   ... !!! ", "New conversation"],
      ["@chatgpt   A useful topic!", "A useful topic!"],
      ["@chatgptxyz remains text", "@chatgptxyz remains text"],
      ["@chatgpt Întrebări și răspunsuri", "Întrebări și răspunsuri"],
      ["@chatgpt 😀 🎉", "New conversation"],
    ])("generates a non-empty first-message title for %s", async (content, expectedTitle) => {
      conversationFindUniqueMock.mockResolvedValue({ title: "New Chat" });
      messageCountMock.mockResolvedValue(0);

      await sendHumanMessage(42, content, null, CLIENT_MESSAGE_ID);

      expect(conversationUpdateMock).toHaveBeenNthCalledWith(1, {
        where: { id: 42 },
        data: { title: expectedTitle },
      });
      expect(expectedTitle.length).toBeLessThanOrEqual(50);
    });

    it("keeps generated titles within the existing 50-character limit", async () => {
      conversationFindUniqueMock.mockResolvedValue({ title: "New Chat" });
      messageCountMock.mockResolvedValue(0);

      await sendHumanMessage(42, `@gemini ${"meaningful ".repeat(10)}`, null, CLIENT_MESSAGE_ID);

      const title = conversationUpdateMock.mock.calls[0][0].data.title;
      expect(title).toHaveLength(50);
      expect(title.endsWith("...")).toBe(true);
    });

    it(
      "keeps an existing New Chat title when the conversation already has messages",
      async () => {
        conversationFindUniqueMock.mockResolvedValue(
          {
            title: "New Chat",
          }
        );

        messageCountMock.mockResolvedValue(
          1
        );

        await sendHumanMessage(
            42,
            "Another message",
            null,
            CLIENT_MESSAGE_ID
        );

        expect(
          messageCountMock
        ).toHaveBeenCalledTimes(1);

        expect(
          conversationUpdateMock
        ).toHaveBeenCalledTimes(1);

        expect(
          conversationUpdateMock
        ).toHaveBeenCalledWith({
          where: {
            id: 42,
          },
          data: {
            updatedAt:
              expect.any(Date),
          },
        });
      }
    );

    it("returns the existing message for the same client id and canonical payload", async () => {
      const first = await sendHumanMessage(42, " hello ", null, CLIENT_MESSAGE_ID);
      const persisted = messageCreateMock.mock.calls[0][0].data;
      messageCreateMock.mockRejectedValueOnce({ code: "P2002" });
      messageFindUniqueMock.mockResolvedValueOnce({ id: 123, ...persisted });

      const duplicate = await sendHumanMessage(42, "hello", null, CLIENT_MESSAGE_ID);

      expect(first.outcome).toBe("created");
      expect(duplicate).toMatchObject({ outcome: "duplicate", messageId: 123, clientMessageId: CLIENT_MESSAGE_ID });
      expect(messageFindUniqueMock).toHaveBeenCalledWith({
        where: { conversationId_authorId_clientMessageId: { conversationId: 42, authorId: "user-1", clientMessageId: CLIENT_MESSAGE_ID } },
      });
    });

    it("rejects reuse of a client id with another payload", async () => {
      messageCreateMock.mockRejectedValueOnce({ code: "P2002" });
      messageFindUniqueMock.mockResolvedValueOnce({
        id: 123,
        conversationId: 42,
        authorType: "human",
        authorId: "user-1",
        content: "different",
        replyToId: null,
        clientMessageId: CLIENT_MESSAGE_ID,
        clientPayloadHash: "different-hash",
      });
      await expect(sendHumanMessage(42, "hello", null, CLIENT_MESSAGE_ID)).rejects.toThrow("CLIENT_MESSAGE_ID_CONFLICT");
    });
  }
);
