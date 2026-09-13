import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import {
  createAgentCredential,
  createPairingCredential,
  credentialHashesMatch,
  hashCredential,
  parseCredentialId,
} from "./credentials";

export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;

export async function createPairingToken(userId: string, now = new Date()) {
  const token = createPairingCredential();
  const expiresAt = new Date(now.getTime() + PAIRING_TOKEN_TTL_MS);
  await prisma.personalAgentPairingToken.upsert({
    where: { userId },
    create: {
      id: token.id,
      userId,
      tokenHash: token.hash,
      expiresAt,
    },
    update: {
      id: token.id,
      tokenHash: token.hash,
      createdAt: now,
      expiresAt,
      redeemedAt: null,
    },
  });
  return { pairingToken: token.credential, expiresAt };
}

export async function redeemPairingToken(pairingToken: string, now = new Date()) {
  const tokenId = parseCredentialId(pairingToken, "pair1");
  if (!tokenId) return null;
  const stored = await prisma.personalAgentPairingToken.findUnique({
    where: { id: tokenId },
  });
  if (!stored || stored.redeemedAt || stored.expiresAt <= now ||
      !credentialHashesMatch(stored.tokenHash, hashCredential(pairingToken))) {
    return null;
  }

  const agentId = crypto.randomUUID();
  const agentCredential = createAgentCredential(agentId);
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.personalAgentPairingToken.updateMany({
      where: {
        id: stored.id,
        redeemedAt: null,
        expiresAt: { gt: now },
      },
      data: { redeemedAt: now },
    });
    if (consumed.count !== 1) return null;

    const previous = await tx.personalAgent.findUnique({
      where: { userId: stored.userId },
      select: { id: true },
    });
    if (previous) {
      await tx.personalAgent.update({
        where: { id: previous.id },
        data: {
          id: agentId,
          credentialHash: agentCredential.hash,
          adapterStatus: null,
          adapterStatusAt: null,
          pairedAt: now,
          lastSeenAt: null,
          revokedAt: null,
        },
      });
    } else {
      await tx.personalAgent.create({
        data: {
          id: agentId,
          userId: stored.userId,
          credentialHash: agentCredential.hash,
          pairedAt: now,
        },
      });
    }
    return {
      agentId,
      agentCredential: agentCredential.credential,
    };
  });
}

export async function revokePersonalAgent(userId: string, now = new Date()) {
  return prisma.personalAgent.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}
