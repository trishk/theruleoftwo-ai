import { prisma } from "@/lib/db/prisma";
import type { GeminiAdapterStatus } from "./protocol";

export const PERSONAL_AGENT_ONLINE_WINDOW_MS = 60_000;

export function isPersonalAgentOnline(
  lastSeenAt: Date | null,
  now = new Date()
) {
  return Boolean(
    lastSeenAt &&
    lastSeenAt.getTime() >= now.getTime() - PERSONAL_AGENT_ONLINE_WINDOW_MS
  );
}

export async function touchPersonalAgent(agentId: string, now = new Date()) {
  return prisma.personalAgent.updateMany({
    where: { id: agentId, revokedAt: null },
    data: { lastSeenAt: now },
  });
}

export async function updatePersonalAgentStatus(
  agentId: string,
  adapterStatus: GeminiAdapterStatus,
  now = new Date()
) {
  return prisma.personalAgent.updateMany({
    where: { id: agentId, revokedAt: null },
    data: {
      lastSeenAt: now,
      adapterStatus,
      adapterStatusAt: now,
    },
  });
}
