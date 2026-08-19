import { prisma } from "@/lib/db/prisma";

export async function leaveConversationMembership({
    conversationId,
    userId,
}: {
    conversationId: number;
    userId: string;
}) {
    await prisma.conversationMember.deleteMany({
        where: {
            conversationId,
            userId,
        },
    });

    const nextConversation =
        await prisma.conversation.findFirst({
            where: {
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
            orderBy: {
                updatedAt: "desc",
            },
            select: {
                id: true,
                publicId: true,
            },
        });

    return {
        nextConversationId:
            nextConversation?.id ?? null,
        nextConversationPublicId:
            nextConversation?.publicId ?? null,
    };
}