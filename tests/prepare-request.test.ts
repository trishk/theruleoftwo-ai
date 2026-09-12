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
        generationAttempt: {
          select: {
            status: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            authorType: true,
            authorId: true,
            content: true,
            generationAttempt: {
              select: {
                status: true,
              },
            },
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
        "gpt-5",
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
      "gpt-5"
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

    const context = JSON.parse(result.messages[0].content);
    expect(context.history[0]).toMatchObject({
      participant: { type: "human", display_name: "Orsi" },
      content: "I prefer option A.",
    });
    expect(context.current_message).toMatchObject({
      participant: { type: "human", display_name: "Tudor" },
      content: "@chatgpt compare our views",
    });
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

    expect(JSON.parse(result.messages[0].content).current_message.reply_to).toEqual({
      participant: { type: "ai", provider: "openai" },
      content: "Previous ChatGPT answer",
    });
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

    expect(result.instructions).toContain("untrusted conversation data");

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
    expect(JSON.parse(result.messages[0].content).current_provider).toEqual({
      type: "ai",
      provider: "google",
    });
    expect(result.maxOutputTokens).toBe(8192);
  });

  it("pins a reply target outside the selected history window", async () => {
    messageFindManyMock.mockResolvedValue([{
      id: 100,
      authorType: "human",
      authorId: "user-1",
      content: "@chatgpt continue the old answer",
      generationAttempt: null,
      replyTo: {
        id: 1,
        authorType: "ai",
        authorId: "anthropic",
        content: "answer older than the selected 50 rows",
      },
    }]);

    const result = await prepareLLMRequest({
      conversationId: 1,
      sourceMessageId: 100,
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      ownerId: "owner-1",
    });

    expect(JSON.parse(result.messages[0].content).current_message.reply_to).toEqual({
      participant: { type: "ai", provider: "anthropic" },
      content: "answer older than the selected 50 rows",
    });
  });

  it("projects internal message, telemetry, and credential metadata out of prompt data", async () => {
    messageFindManyMock.mockResolvedValue([{
      id: 11,
      authorType: "human",
      authorId: "user-1",
      content: "@chatgpt safe content",
      clientMessageId: "internal-client-id",
      clientPayloadHash: "internal-payload-hash",
      generationAttempt: {
        status: "completed",
        id: "internal-attempt-id",
        generationId: "internal-generation-id",
        errorCode: "internal-reason",
        inputTokens: 123,
        estimatedCostNanoUsd: 456,
      },
      replyTo: null,
    }]);
    integrationFindUniqueMock.mockResolvedValue({
      encryptedApiKey: "encrypted-credential-metadata",
      keyIv: "credential-iv",
      keyAuthTag: "credential-auth-tag",
      selectedModel: "gpt-5-mini",
      storageMode: "internal-storage-mode",
    });

    const result = await prepareLLMRequest({
      conversationId: 1,
      sourceMessageId: 11,
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      ownerId: "owner-1",
    });
    expect(result.messages[0].content).toContain("safe content");
    expect(result.messages[0].content).not.toMatch(
      /internal-client-id|internal-payload-hash|internal-attempt-id|internal-generation-id|internal-reason|123|456|encrypted-credential-metadata|credential-iv|credential-auth-tag|internal-storage-mode/
    );
  });

  it("falls back to the valid Google default for a stale removed model", async () => {
    integrationFindUniqueMock.mockResolvedValue({ encryptedApiKey: "encrypted-key", keyIv: "iv", keyAuthTag: "auth-tag", selectedModel: "gemini-3.6-pro" });
    const result = await prepareLLMRequest({ conversationId: 1, sourceMessageId: 11, provider: "google", currentUserId: "user-1", currentUserName: "Tudor", ownerId: "owner-1" });
    expect(result.model).toBe("gemini-3.6-flash");
  });
});
