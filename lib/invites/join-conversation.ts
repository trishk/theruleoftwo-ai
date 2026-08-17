import { prisma } from "@/lib/db/prisma";

type JoinConversationArgs = {
  conversationId: number;
  userId: string;
};

export async function joinConversation({
  conversationId,
  userId,
}: JoinConversationArgs) {
  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        ownerId: true,
      },
    });

  if (!conversation) {
    throw new Error(
      "Conversation not found."
    );
  }

  if (
    conversation.ownerId === userId
  ) {
    return {
      conversationId,
      isOwner: true,
    };
  }

  await prisma.conversationMember.upsert({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    update: {},
    create: {
      conversationId,
      userId,
    },
  });

  return {
    conversationId,
    isOwner: false,
  };
}