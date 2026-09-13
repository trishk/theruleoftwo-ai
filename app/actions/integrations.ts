"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireSettingsAccess } from "@/lib/auth/settings-access";
import { PROVIDERS } from "@/lib/llm/providers";
import type { Provider } from "@/lib/llm/types";
import { encryptSecret } from "@/lib/security/encryption";

function isProvider(
  value: string
): value is Provider {
  return (
    value === "openai" ||
    value === "anthropic" ||
    value === "google"
  );
}

function getProviderConfig(
  provider: string
) {
  if (!isProvider(provider)) {
    throw new Error(
      "Invalid provider."
    );
  }

  return {
    provider,
    config: PROVIDERS[provider],
  };
}

export async function updateSelectedModel(
  provider: string,
  selectedModel: string
) {
  const user = await requireSettingsAccess();

  const {
    provider: validatedProvider,
    config: providerConfig,
  } = getProviderConfig(provider);

  const allowedModels =
    providerConfig.models as readonly string[];

  if (
    !allowedModels.includes(
      selectedModel
    )
  ) {
    throw new Error(
      "Invalid model."
    );
  }

  await prisma.userIntegration.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider:
          validatedProvider,
      },
    },
    update: {
      selectedModel,
    },
    create: {
      userId: user.id,
      provider:
        validatedProvider,
      selectedModel,
    },
  });

  revalidatePath("/settings");
}

export async function saveIntegrationApiKey(
  provider: string,
  apiKey: string
) {
  const user = await requireSettingsAccess();

  const {
    provider: validatedProvider,
    config: providerConfig,
  } = getProviderConfig(provider);

  const trimmedApiKey =
    apiKey.trim();

  if (!trimmedApiKey) {
    throw new Error(
      "API key is required."
    );
  }

  const encrypted =
    encryptSecret(
      trimmedApiKey
    );

  await prisma.userIntegration.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider:
          validatedProvider,
      },
    },
    update: {
      encryptedApiKey:
        encrypted.encrypted,
      keyIv:
        encrypted.iv,
      keyAuthTag:
        encrypted.authTag,
      storageMode:
        "persistent",
    },
    create: {
      userId:
        user.id,
      provider:
        validatedProvider,
      selectedModel:
        providerConfig.defaultModel,
      encryptedApiKey:
        encrypted.encrypted,
      keyIv:
        encrypted.iv,
      keyAuthTag:
        encrypted.authTag,
      storageMode:
        "persistent",
    },
  });

  revalidatePath("/settings");
}

export async function removeIntegration(
  provider: string
) {
  const user = await requireSettingsAccess();

  const {
    provider: validatedProvider,
  } = getProviderConfig(provider);

  await prisma.userIntegration.updateMany({
    where: {
      userId:
        user.id,
      provider:
        validatedProvider,
    },
    data: {
      encryptedApiKey:
        null,
      keyIv:
        null,
      keyAuthTag:
        null,
    },
  });

  revalidatePath("/settings");
}

export async function updateGoogleConnectionMode(mode: string) {
  const user = await requireSettingsAccess();
  if (mode !== "api" && mode !== "personal") throw new Error("Invalid connection mode.");
  if (mode === "personal") {
    const agent = await prisma.personalAgent.findUnique({ where: { userId: user.id }, select: { revokedAt: true } });
    if (!agent || agent.revokedAt) throw new Error("A paired Personal Agent is required.");
  }
  await prisma.userIntegration.upsert({
    where: { userId_provider: { userId: user.id, provider: "google" } },
    update: { connectionMode: mode },
    create: { userId: user.id, provider: "google", selectedModel: PROVIDERS.google.defaultModel, connectionMode: mode },
  });
  revalidatePath("/settings");
}
