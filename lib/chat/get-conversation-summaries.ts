import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createConversationSummary } from "@/lib/chat/conversation-summary";
import type { ConversationSummary } from "@/lib/chat/conversation-summary";

export async function getConversationSummaries({
  currentUserId,
  activeConversationId,
}: {
  currentUserId: string;
  activeConversationId: number | null;
}): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { ownerId: currentUserId },
        {
          members: {
            some: { userId: currentUserId },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      publicId: true,
      title: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      members: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
      readStates: {
        where: { userId: currentUserId },
        select: { lastReadAt: true },
        take: 1,
      },
      messages: {
        orderBy: { createdAt: "desc" },
        select: {
          authorType: true,
          authorId: true,
          content: true,
          createdAt: true,
        },
        take: 1,
      },
    },
  });

  if (conversations.length === 0) {
    return [];
  }

  const authorActivity = await prisma.message.groupBy({
    by: ["conversationId", "authorType", "authorId"],
    where: {
      conversationId: {
        in: conversations.map((conversation) => conversation.id),
      },
    },
    _max: { createdAt: true },
  });

  const activityByConversationId = new Map<
    number,
    typeof authorActivity
  >();
  for (const activity of authorActivity) {
    const conversationActivity =
      activityByConversationId.get(activity.conversationId) ?? [];
    conversationActivity.push(activity);
    activityByConversationId.set(
      activity.conversationId,
      conversationActivity
    );
  }

  return conversations.map((conversation) => {
    const conversationActivity =
      activityByConversationId.get(conversation.id) ?? [];
    const latestOtherMessageAt = conversationActivity.reduce<Date | null>(
      (latest, activity) => {
        const createdAt = activity._max.createdAt;
        if (
          activity.authorId === currentUserId ||
          !createdAt ||
          (latest && createdAt <= latest)
        ) {
          return latest;
        }
        return createdAt;
      },
      null
    );

    return createConversationSummary({
      conversation,
      aiProviderIds: conversationActivity
        .filter((activity) => activity.authorType === "ai")
        .map((activity) => activity.authorId),
      latestOtherMessageAt,
      currentUserId,
      activeConversationId,
    });
  });
}
