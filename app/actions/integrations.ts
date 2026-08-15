"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { PROVIDERS } from "@/lib/llm/providers";
import { encryptSecret } from "@/lib/security/encryption";

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

export async function removeIntegration(provider: string) {
    const user = await requireUser();

    const providerConfig =
        PROVIDERS[provider as keyof typeof PROVIDERS];

    if (!providerConfig) {
        throw new Error("Invalid provider.");
    }

    await prisma.userIntegration.updateMany({
        where: {
            userId: user.id,
            provider,
        },
        data: {
            encryptedApiKey: null,
            keyIv: null,
            keyAuthTag: null,
        },
    });

    revalidatePath("/settings");
}