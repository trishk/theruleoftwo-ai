import { prisma } from "@/lib/db/prisma";
import type { Provider } from "@/lib/llm/types";

type PersistStreamResponseArgs = {
  conversationId: number;
  provider: Provider;
  content: string;
};

export async function persistStreamResponse({
  conversationId,
  provider,
  content,
}: PersistStreamResponseArgs) {
  if (!content.trim()) {
    return;
  }

  await prisma.message.create({
    data: {
      conversationId,
      authorType: "ai",
      authorId: provider,
      content,
    },
  });

  await prisma.conversation.update({
    where: {
      id: conversationId,
    },
    data: {
      updatedAt: new Date(),
    },
  });
}