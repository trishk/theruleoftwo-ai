import { prisma } from "@/lib/db/prisma";
import { PROVIDERS } from "./providers";
import { decryptSecret } from "@/lib/security/encryption";
import { buildConversationContext } from "./context";
import type { Provider } from "./types";

type PrepareLLMRequestArgs = {
  conversationId: number;
  provider: Provider;
  currentUserId: string;
  currentUserName?: string | null;
  ownerId: string;
};

export async function prepareLLMRequest({
  conversationId,
  provider,
  currentUserId,
  currentUserName,
  ownerId,
}: PrepareLLMRequestArgs) {
  const history = await prisma.message.findMany({
    where: {
      conversationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  history.reverse();

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

  const selectedModel =
    integration.selectedModel ??
    PROVIDERS[provider].defaultModel;

  const apiKey = decryptSecret(
    integration.encryptedApiKey,
    integration.keyIv,
    integration.keyAuthTag
  );

  const context = buildConversationContext({
    provider,
    messages: history,
    currentUserId,
    currentUserName,
  });

  return {
    provider,
    model: selectedModel,
    apiKey,
    instructions: context.instructions,
    messages: context.messages,
  };
}