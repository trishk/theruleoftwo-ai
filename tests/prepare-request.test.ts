import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  messageFindManyMock,
  userFindManyMock,
  integrationFindUniqueMock,
  decryptSecretMock,
} = vi.hoisted(() => ({
  messageFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  integrationFindUniqueMock: vi.fn(),
  decryptSecretMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    message: {
      findMany: messageFindManyMock,
    },
    user: {
      findMany: userFindManyMock,
    },
    userIntegration: {
      findUnique:
        integrationFindUniqueMock,
    },
  },
}));

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: decryptSecretMock,
}));

import { prepareLLMRequest } from "@/lib/llm/prepare-request";

describe("prepareLLMRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    integrationFindUniqueMock.mockResolvedValue({
      encryptedApiKey:
        "encrypted-key",
      keyIv: "iv",
      keyAuthTag: "auth-tag",
      selectedModel: null,
    });

    decryptSecretMock.mockReturnValue(
      "decrypted-api-key"
    );

    userFindManyMock.mockResolvedValue([]);
  });

  it("anchors conversation context to the source message", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 11,
        authorType: "human",
        authorId: "user-1",
        content:
          "@chatgpt @claude what do you think?",
        createdAt: new Date(),
        replyTo: null,
      },
      {
        id: 10,
        authorType: "human",
        authorId: "user-1",
        content:
          "earlier message",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    await prepareLLMRequest({
      conversationId: 1,
      sourceMessageId: 11,
      provider: "anthropic",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      ownerId: "owner-1",
    });

    expect(
      messageFindManyMock
    ).toHaveBeenCalledWith({
      where: {
        conversationId: 1,
        id: {
          lte: 11,
        },
      },
      orderBy: {
        id: "desc",
      },
      take: 50,
      include: {
        replyTo: {
          select: {
            id: true,
            authorType: true,
            authorId: true,
            content: true,
          },
        },
      },
    });
  });

  it("does not include messages persisted after the source message", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 11,
        authorType: "human",
        authorId: "user-1",
        content:
          "@claude answer independently",
        createdAt: new Date(),
        replyTo: null,
      },
      {
        id: 10,
        authorType: "human",
        authorId: "user-1",
        content:
          "earlier context",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    const result =
      await prepareLLMRequest({
        conversationId: 1,
        sourceMessageId: 11,
        provider: "anthropic",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        ownerId: "owner-1",
      });

    const content =
      result.messages[0].content;

    expect(content).toContain(
      "earlier context"
    );

    expect(content).toContain(
      "@claude answer independently"
    );

    expect(content).not.toContain(
      "ChatGPT response that arrived later"
    );
  });

  it("uses the conversation owners provider configuration", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 11,
        authorType: "human",
        authorId: "user-1",
        content:
          "@chatgpt hello",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    await prepareLLMRequest({
      conversationId: 1,
      sourceMessageId: 11,
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      ownerId: "owner-1",
    });

    expect(
      integrationFindUniqueMock
    ).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "owner-1",
          provider: "openai",
        },
      },
    });
  });

  it("returns the decrypted API key and selected model", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 11,
        authorType: "human",
        authorId: "user-1",
        content:
          "@chatgpt hello",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    integrationFindUniqueMock.mockResolvedValue({
      encryptedApiKey:
        "encrypted-key",
      keyIv: "iv",
      keyAuthTag: "auth-tag",
      selectedModel:
        "configured-model",
    });

    decryptSecretMock.mockReturnValue(
      "real-api-key"
    );

    const result =
      await prepareLLMRequest({
        conversationId: 1,
        sourceMessageId: 11,
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        ownerId: "owner-1",
      });

    expect(result.model).toBe(
      "configured-model"
    );

    expect(result.apiKey).toBe(
      "real-api-key"
    );

    expect(result.provider).toBe(
      "openai"
    );
  });

  it("includes human display names in the generated context", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 12,
        authorType: "human",
        authorId: "user-1",
        content:
          "@chatgpt compare our views",
        createdAt: new Date(),
        replyTo: null,
      },
      {
        id: 11,
        authorType: "human",
        authorId: "user-2",
        content:
          "I prefer option A.",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    userFindManyMock.mockResolvedValue([
      {
        id: "user-1",
        name: "Tudor",
      },
      {
        id: "user-2",
        name: "Orsi",
      },
    ]);

    const result =
      await prepareLLMRequest({
        conversationId: 1,
        sourceMessageId: 12,
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        ownerId: "owner-1",
      });

    const content =
      result.messages[0].content;

    expect(content).toContain(
      "Orsi: I prefer option A."
    );

    expect(content).toContain(
      "Tudor: @chatgpt compare our views"
    );
  });

  it("includes reply metadata when preparing the context", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 12,
        authorType: "human",
        authorId: "user-1",
        content:
          "@claude I disagree",
        createdAt: new Date(),
        replyTo: {
          id: 11,
          authorType: "ai",
          authorId: "openai",
          content:
            "Previous ChatGPT answer",
        },
      },
      {
        id: 11,
        authorType: "ai",
        authorId: "openai",
        content:
          "Previous ChatGPT answer",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    userFindManyMock.mockResolvedValue([
      {
        id: "user-1",
        name: "Tudor",
      },
    ]);

    const result =
      await prepareLLMRequest({
        conversationId: 1,
        sourceMessageId: 12,
        provider: "anthropic",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        ownerId: "owner-1",
      });

    expect(
      result.messages[0].content
    ).toContain(
      "Replying to ChatGPT: Previous ChatGPT answer"
    );
  });

  it("uses the providers default model when no model is selected", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 11,
        authorType: "human",
        authorId: "user-1",
        content:
          "@chatgpt hello",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    integrationFindUniqueMock.mockResolvedValue({
      encryptedApiKey:
        "encrypted-key",
      keyIv: "iv",
      keyAuthTag: "auth-tag",
      selectedModel: null,
    });

    const result =
      await prepareLLMRequest({
        conversationId: 1,
        sourceMessageId: 11,
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        ownerId: "owner-1",
      });

    expect(result.model).toBeTruthy();
    expect(result.model).not.toBe("");
  });

  it("passes generated instructions and conversation messages to the LLM request", async () => {
    messageFindManyMock.mockResolvedValue([
      {
        id: 11,
        authorType: "human",
        authorId: "user-1",
        content:
          "@gemini give your view",
        createdAt: new Date(),
        replyTo: null,
      },
    ]);

    const result =
      await prepareLLMRequest({
        conversationId: 1,
        sourceMessageId: 11,
        provider: "google",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        ownerId: "owner-1",
      });

    expect(result.instructions).toContain(
      "You are Gemini"
    );

    expect(
      result.messages
    ).toHaveLength(1);

    expect(
      result.messages[0]
    ).toEqual({
      role: "user",
      content:
        expect.stringContaining(
          "@gemini give your view"
        ),
    });
  });
});