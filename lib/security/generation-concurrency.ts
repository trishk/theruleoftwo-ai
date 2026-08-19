import crypto from "crypto";

import { prisma } from "@/lib/db/prisma";

const MAX_CONCURRENT_GENERATIONS = 3;
const LEASE_DURATION_MS = 5 * 60 * 1000;

type GenerationLease = {
  token: string;
  slot: number;
};

export async function acquireGenerationLease(
  userId: string
): Promise<GenerationLease | null> {
  const now = new Date();

  await prisma.lLMGenerationLease.deleteMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  });

  for (
    let slot = 1;
    slot <= MAX_CONCURRENT_GENERATIONS;
    slot += 1
  ) {
    const token =
      crypto.randomUUID();

    try {
      await prisma.lLMGenerationLease.create({
        data: {
          userId,
          slot,
          token,
          expiresAt: new Date(
            now.getTime() +
              LEASE_DURATION_MS
          ),
        },
      });

      return {
        token,
        slot,
      };
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(
              (
                error as {
                  code?: unknown;
                }
              ).code
            )
          : null;

      if (code === "P2002") {
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function releaseGenerationLease(
  token: string
) {
  await prisma.lLMGenerationLease.deleteMany({
    where: {
      token,
    },
  });
}