import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

type MarkConversationReadArgs = {
  conversationId: number;
  userId: string;
};

export async function markConversationRead({
  conversationId,
  userId,
}: MarkConversationReadArgs) {
  await requireConversationAccess(
    conversationId,
    userId
  );

  await prisma.conversationReadState.upsert({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    update: {
      lastReadAt: new Date(),
    },
    create: {
      conversationId,
      userId,
      lastReadAt: new Date(),
    },
  });
}