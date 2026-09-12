import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";

type SettingsConversation = {
  ownerId: string;
};

export function canAccessSettings({
  userId,
  isGuest,
  conversations,
}: {
  userId: string;
  isGuest: boolean;
  conversations: SettingsConversation[];
}) {
  if (isGuest) {
    return false;
  }

  return (
    conversations.length === 0 ||
    conversations.some(
      (conversation) =>
        conversation.ownerId === userId
    )
  );
}

export async function requireSettingsAccess() {
  const user = await requireUser();
  const conversations =
    await prisma.conversation.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: { userId: user.id },
            },
          },
        ],
      },
      select: { ownerId: true },
    });

  if (
    !canAccessSettings({
      userId: user.id,
      isGuest: user.isGuest,
      conversations,
    })
  ) {
    throw new Error(
      "You do not have access to Settings."
    );
  }

  return user;
}
