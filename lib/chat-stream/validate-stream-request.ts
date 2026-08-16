import { prisma } from "@/lib/db/prisma";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { extractMentions } from "@/lib/llm/mentions";
import type { Provider } from "@/lib/llm/types";

type ValidateStreamRequestArgs = {
  rawBody: unknown;
  userId: string;
};

type ValidatedStreamRequest = {
  conversationId: number;
  messageId: number;
  provider: Provider;
  ownerId: string;
};

function isProvider(
  value: unknown
): value is Provider {
  return (
    value === "openai" ||
    value === "anthropic" ||
    value === "google"
  );
}

export async function validateStreamRequest({
  rawBody,
  userId,
}: ValidateStreamRequestArgs): Promise<
  ValidatedStreamRequest
> {
  if (
    typeof rawBody !== "object" ||
    rawBody === null
  ) {
    throw new Error(
      "INVALID_REQUEST_BODY"
    );
  }

  const body = rawBody as Record<
    string,
    unknown
  >;

  const conversationId =
    body.conversationId;

  const messageId =
    body.messageId;

  const provider =
    body.provider;

  if (
    typeof conversationId !== "number" ||
    !Number.isInteger(conversationId) ||
    conversationId <= 0
  ) {
    throw new Error(
      "INVALID_CONVERSATION_ID"
    );
  }

  if (
    typeof messageId !== "number" ||
    !Number.isInteger(messageId) ||
    messageId <= 0
  ) {
    throw new Error(
      "INVALID_MESSAGE_ID"
    );
  }

  if (!isProvider(provider)) {
    throw new Error(
      "INVALID_PROVIDER"
    );
  }

  let conversation;

  try {
    conversation =
      await requireConversationAccess(
        conversationId,
        userId
      );
  } catch {
    throw new Error(
      "CONVERSATION_NOT_FOUND"
    );
  }

  const sourceMessage =
    await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        authorType: "human",
        authorId: userId,
      },
      select: {
        content: true,
      },
    });

  if (!sourceMessage) {
    throw new Error(
      "MESSAGE_NOT_FOUND"
    );
  }

  const mentionedProviders =
    extractMentions(
      sourceMessage.content
    );

  if (
    !mentionedProviders.includes(
      provider
    )
  ) {
    throw new Error(
      "PROVIDER_NOT_MENTIONED"
    );
  }

  return {
    conversationId,
    messageId,
    provider,
    ownerId: conversation.ownerId,
  };
}