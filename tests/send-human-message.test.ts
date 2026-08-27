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
      },
    },
  })
);

import { sendHumanMessage } from "@/app/actions/messages";

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
            "@chatgpt hello"
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
          },
        });

        expect(result).toEqual({
          messageId: 123,
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
          "@chatgpt First decision"
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
      ["@chatgpt Întrebări și răspunsuri", "Întrebări și răspunsuri"],
      ["@chatgpt 😀 🎉", "New conversation"],
    ])("generates a non-empty first-message title for %s", async (content, expectedTitle) => {
      conversationFindUniqueMock.mockResolvedValue({ title: "New Chat" });
      messageCountMock.mockResolvedValue(0);

      await sendHumanMessage(42, content);

      expect(conversationUpdateMock).toHaveBeenNthCalledWith(1, {
        where: { id: 42 },
        data: { title: expectedTitle },
      });
      expect(expectedTitle.length).toBeLessThanOrEqual(50);
    });

    it("keeps generated titles within the existing 50-character limit", async () => {
      conversationFindUniqueMock.mockResolvedValue({ title: "New Chat" });
      messageCountMock.mockResolvedValue(0);

      await sendHumanMessage(42, `@gemini ${"meaningful ".repeat(10)}`);

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
          "Another message"
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
  }
);
