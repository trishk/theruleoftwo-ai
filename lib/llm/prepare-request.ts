import { prisma } from "@/lib/db/prisma";
import { PROVIDERS } from "./providers";
import { decryptSecret } from "@/lib/security/encryption";
import { buildConversationContext } from "./context";
import type { Provider } from "./types";

const CONTEXT_MESSAGE_LIMIT = 50;

type PrepareLLMRequestArgs = {
  conversationId: number;
  sourceMessageId: number;
  provider: Provider;
  currentUserId: string;
  currentUserName?: string | null;
  ownerId: string;
};

export async function prepareLLMRequest(args: PrepareLLMRequestArgs) {
  const { conversationId, sourceMessageId, provider, ownerId } = args;
  const history =
    await prisma.message.findMany({
      where: {
        conversationId,
        id: {
          lte: sourceMessageId,
        },
      },
      orderBy: {
        id: "desc",
      },
      take: CONTEXT_MESSAGE_LIMIT,
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

  history.reverse();

  const humanAuthorIds = [
    ...new Set(
      history.flatMap((message) => {
        const ids: string[] = [];

        if (
          message.authorType === "human"
        ) {
          ids.push(message.authorId);
        }

        if (
          message.replyTo?.authorType ===
          "human"
        ) {
          ids.push(
            message.replyTo.authorId
          );
        }

        return ids;
      })
    ),
  ];

  const humanAuthors =
    humanAuthorIds.length > 0
      ? await prisma.user.findMany({
        where: {
          id: {
            in: humanAuthorIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      })
      : [];

  const humanAuthorNames = new Map(
    humanAuthors.map((user) => [
      user.id,
      user.name,
    ])
  );

  const contextMessages =
    history.map((message) => ({
      authorType:
        message.authorType,
      authorId:
        message.authorId,
      authorName:
        message.authorType ===
          "human"
          ? humanAuthorNames.get(
            message.authorId
          ) ?? null
          : null,
      content:
        message.content,
      generationStatus:
        message.generationAttempt
          ?.status ?? null,
      replyTo:
        message.replyTo
          ? {
            id:
              message.replyTo.id,
            authorType:
              message.replyTo
                .authorType,
            authorId:
              message.replyTo
                .authorId,
            authorName:
              message.replyTo
                .authorType ===
                "human"
                ? humanAuthorNames.get(
                  message.replyTo
                    .authorId
                ) ?? null
                : null,
            content:
              message.replyTo
                .content,
            generationStatus:
              message.replyTo
                .generationAttempt
                ?.status ?? null,
          }
          : null,
    }));

  const integration =
    await prisma.userIntegration.findUnique({
      where: {
        userId_provider: {
          userId: ownerId,
          provider,
        },
      },
    });

  if (
    !integration?.encryptedApiKey ||
    !integration.keyIv ||
    !integration.keyAuthTag
  ) {
    throw new Error(
      "Provider is not configured for this conversation."
    );
  }

  const configuredModel = integration.selectedModel;
  const allowedModels = PROVIDERS[provider].models as readonly string[];
  const selectedModel = allowedModels.includes(configuredModel)
    ? configuredModel
    : PROVIDERS[provider].defaultModel;

  const apiKey = decryptSecret(
    integration.encryptedApiKey,
    integration.keyIv,
    integration.keyAuthTag
  );

  const context =
    buildConversationContext({
      provider,
      model: selectedModel,
      messages: contextMessages,
    });

  return {
    provider,
    model: selectedModel,
    apiKey,
    instructions:
      context.instructions,
    messages:
      context.messages,
    maxOutputTokens:
      context.maxOutputTokens,
  };
}
