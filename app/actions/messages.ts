"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { askLLM } from "@/lib/llm/registry";
import { extractMentions } from "@/lib/llm/mentions";
import { buildConversationContext } from "@/lib/llm/context";
import { requireUser } from "@/lib/auth/require-user";
import { PROVIDERS } from "@/lib/llm/providers";
import { decryptSecret } from "@/lib/security/encryption";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

export async function sendMessage(
    conversationId: number,
    content: string,
    replyToId?: number | null
) {
    const user = await requireUser();

    const trimmedContent = content.trim();

    if (!trimmedContent) return;

    if (trimmedContent.length > 4000) {
        throw new Error("Message is too long.");
    }

    const conversation = await requireConversationAccess(
        conversationId,
        user.id
    );

    const conversationRecord = await prisma.conversation.findUnique({
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
        const replyToMessage = await prisma.message.findFirst({
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

    const existingMessageCount = await prisma.message.count({
        where: {
            conversationId,
        },
    });

    await prisma.message.create({
        data: {
            conversationId,
            authorType: "human",
            authorId: user.id,
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

    const providers = extractMentions(trimmedContent);

    if (providers.length > 0) {
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

        const integrations = await prisma.userIntegration.findMany({
            where: {
                userId: conversation.ownerId,
                provider: {
                    in: providers,
                },
            },
        });

        for (const provider of providers) {
            const integration = integrations.find(
                (item) => item.provider === provider
            );

            const selectedModel =
                integration?.selectedModel ??
                PROVIDERS[provider].defaultModel;

            let apiKey: string | undefined;

            if (
                integration?.encryptedApiKey &&
                integration?.keyIv &&
                integration?.keyAuthTag
            ) {
                apiKey = decryptSecret(
                    integration.encryptedApiKey,
                    integration.keyIv,
                    integration.keyAuthTag
                );
            }

            const context = buildConversationContext({
                provider,
                messages: history,
                currentUserId: user.id,
                currentUserName: user.name,
            });

            const response = await askLLM({
                provider,
                model: selectedModel,
                apiKey,
                instructions: context.instructions,
                messages: context.messages,
            });

            await prisma.message.create({
                data: {
                    conversationId,
                    authorType: "ai",
                    authorId: response.provider,
                    content: response.text,
                },
            });
        }
    }

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
}