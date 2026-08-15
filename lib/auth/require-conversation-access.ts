import { prisma } from "@/lib/db/prisma";

export async function requireConversationAccess(
    conversationId: number,
    userId: string
) {
    const conversation = await prisma.conversation.findFirst({
        where: {
            id: conversationId,
            OR: [
                {
                    ownerId: userId,
                },
                {
                    members: {
                        some: {
                            userId,
                        },
                    },
                },
            ],
        },
        select: {
            id: true,
            ownerId: true,
            owner: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found.");
    }

    return conversation;
}