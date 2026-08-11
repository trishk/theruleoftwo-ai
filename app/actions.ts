"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { askLLM } from "@/lib/llm/registry";
import { extractMentions } from "@/lib/llm/mentions";
import { buildConversationContext } from "@/lib/llm/context";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { PROVIDERS } from "@/lib/llm/providers";
import { encryptSecret } from "@/lib/security/encryption";
import { decryptSecret } from "@/lib/security/encryption";

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

    const conversation = await prisma.conversation.findFirst({
        where: {
            id: conversationId,
            ownerId: user.id,
        },
        select: {
            id: true,
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

    await prisma.message.create({
        data: {
            conversationId,
            authorType: "human",
            authorId: user.id,
            content: trimmedContent,
            replyToId: replyToId ?? null,
        },
    });

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

export async function updateDisplayName(formData: FormData) {
    const user = await requireUser();

    const name = String(formData.get("displayName") ?? "").trim();

    if (name.length > 50) {
        throw new Error("Display name is too long.");
    }

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            name: name || null,
        },
    });

    revalidatePath("/settings");
}

export async function signOut() {
    const supabase = await createClient();

    await supabase.auth.signOut();

    redirect("/login");
}

export async function updateSelectedModel(
    provider: string,
    selectedModel: string
) {
    const user = await requireUser();

    const providerConfig =
        PROVIDERS[provider as keyof typeof PROVIDERS];

    if (
        !providerConfig ||
        !(providerConfig.models as readonly string[]).includes(selectedModel)
    ) {
        throw new Error("Invalid provider or model.");
    }

    await prisma.userIntegration.upsert({
        where: {
            userId_provider: {
                userId: user.id,
                provider,
            },
        },
        update: {
            selectedModel,
        },
        create: {
            userId: user.id,
            provider,
            selectedModel,
        },
    });

    revalidatePath("/settings");
}

export async function saveIntegrationApiKey(
    provider: string,
    apiKey: string
) {
    const user = await requireUser();

    const providerConfig =
        PROVIDERS[provider as keyof typeof PROVIDERS];

    if (!providerConfig) {
        throw new Error("Invalid provider.");
    }

    const trimmedApiKey = apiKey.trim();

    if (!trimmedApiKey) {
        throw new Error("API key is required.");
    }

    const encrypted = encryptSecret(trimmedApiKey);

    await prisma.userIntegration.upsert({
        where: {
            userId_provider: {
                userId: user.id,
                provider,
            },
        },
        update: {
            encryptedApiKey: encrypted.encrypted,
            keyIv: encrypted.iv,
            keyAuthTag: encrypted.authTag,
            storageMode: "persistent",
        },
        create: {
            userId: user.id,
            provider,
            selectedModel: providerConfig.defaultModel,
            encryptedApiKey: encrypted.encrypted,
            keyIv: encrypted.iv,
            keyAuthTag: encrypted.authTag,
            storageMode: "persistent",
        },
    });

    revalidatePath("/settings");
}