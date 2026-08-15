"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { askLLM } from "@/lib/llm/registry";
import { extractMentions } from "@/lib/llm/mentions";
import { buildConversationContext } from "@/lib/llm/context";
import { requireUser } from "@/lib/auth/require-user";
import { PROVIDERS } from "@/lib/llm/providers";
import { decryptSecret } from "@/lib/security/encryption";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

export async function createChat() {
    const user = await requireUser();

    const conversation = await prisma.conversation.create({
        data: {
            title: "New Chat",
            ownerId: user.id,
        },
    });

    redirect(`/chat/${conversation.id}`);
}

export async function renameConversation(
    conversationId: number,
    title: string
) {
    const user = await requireUser();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
        throw new Error("Conversation title is required.");
    }

    if (trimmedTitle.length > 100) {
        throw new Error("Conversation title is too long.");
    }

    await requireConversationAccess(
        conversationId,
        user.id
    );

    const conversation = await prisma.conversation.findUnique({
        where: {
            id: conversationId,
        },
        select: {
            updatedAt: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found.");
    }

    await prisma.conversation.update({
        where: {
            id: conversationId,
        },
        data: {
            title: trimmedTitle,
            updatedAt: conversation.updatedAt,
        },
    });
    revalidatePath(`/chat/${conversationId}`);
    revalidatePath("/");
}

export async function deleteConversation(
    conversationId: number
) {
    const user = await requireUser();

    await requireConversationAccess(
        conversationId,
        user.id
    );

    await prisma.conversation.delete({
        where: {
            id: conversationId,
        },
    });

    revalidatePath("/");
    redirect("/");
}

export async function createConversationInvite(
    conversationId: number
) {
    const user = await requireUser();

    const conversation = await requireConversationAccess(
        conversationId,
        user.id
    );

    if (conversation.ownerId !== user.id) {
        throw new Error("Only the conversation owner can create invites.");
    }

    const token = crypto.randomBytes(32).toString("hex");

    await prisma.conversationInvite.create({
        data: {
            conversationId,
            token,
            createdById: user.id,
        },
    });

    return token;
}

export async function joinConversationByInvite(
    token: string
) {
    const user = await requireUser();

    const invite = await prisma.conversationInvite.findUnique({
        where: {
            token,
        },
        select: {
            conversationId: true,
            expiresAt: true,
            revokedAt: true,
        },
    });

    if (!invite) {
        throw new Error("Invalid invite.");
    }

    if (invite.revokedAt) {
        throw new Error("Invite has been revoked.");
    }

    if (
        invite.expiresAt &&
        invite.expiresAt < new Date()
    ) {
        throw new Error("Invite has expired.");
    }

    const conversation = await prisma.conversation.findUnique({
        where: {
            id: invite.conversationId,
        },
        select: {
            ownerId: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found.");
    }

    if (conversation.ownerId !== user.id) {
        await prisma.conversationMember.upsert({
            where: {
                conversationId_userId: {
                    conversationId: invite.conversationId,
                    userId: user.id,
                },
            },
            update: {},
            create: {
                conversationId: invite.conversationId,
                userId: user.id,
            },
        });
    }

    redirect(`/chat/${invite.conversationId}`);
}

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
                userId: user.id,
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
                currentUserName: conversation.owner?.name,
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