"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { extractMentions } from "@/lib/llm/mentions";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

async function saveHumanMessage(
    conversationId: number,
    userId: string,
    content: string,
    replyToId?: number | null
) {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
        throw new Error("Message is required.");
    }

    if (trimmedContent.length > 4000) {
        throw new Error("Message is too long.");
    }

    const conversationRecord =
        await prisma.conversation.findUnique({
            where: {
                id: conversationId,
            },
            select: {
                title: true,
            },
        });

    if (!conversationRecord) {
        throw new Error("Conversation not found.");
    }

    if (replyToId != null) {
        const replyToMessage =
            await prisma.message.findFirst({
                where: {
                    id: replyToId,
                    conversationId,
                },
                select: {
                    id: true,
                },
            });

        if (!replyToMessage) {
            throw new Error("Invalid reply target.");
        }
    }

    const existingMessageCount =
        await prisma.message.count({
            where: {
                conversationId,
            },
        });

    const createdMessage =
        await prisma.message.create({
            data: {
                conversationId,
                authorType: "human",
                authorId: userId,
                content: trimmedContent,
                replyToId: replyToId ?? null,
            },
        });

    if (
        existingMessageCount === 0 &&
        conversationRecord.title === "New Chat"
    ) {
        const titleContent = trimmedContent
            .replace(/@(chatgpt|claude|gemini)\b/gi, "")
            .replace(/\s+/g, " ")
            .trim();

        const generatedTitle =
            titleContent.length > 50
                ? `${titleContent.slice(0, 47)}...`
                : titleContent;

        await prisma.conversation.update({
            where: {
                id: conversationId,
            },
            data: {
                title: generatedTitle,
            },
        });
    }

    return {
        messageId: createdMessage.id,
        content: trimmedContent,
        providers: extractMentions(trimmedContent),
    };
}

export async function sendHumanMessage(
    conversationId: number,
    content: string,
    replyToId?: number | null
) {
    const user = await requireUser();

    const conversation =
        await requireConversationAccess(
            conversationId,
            user.id
        );

    const {
        messageId,
        providers,
    } = await saveHumanMessage(
        conversationId,
        user.id,
        content,
        replyToId
    );

    

    await prisma.conversation.update({
        where: {
            id: conversationId,
        },
        data: {
            updatedAt: new Date(),
        },
    });

    revalidatePath(`/chat/${conversationId}`);
    revalidatePath("/");

    return {
        messageId,
        providers,
    };
}