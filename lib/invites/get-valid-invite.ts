import { prisma } from "@/lib/db/prisma";

export const MAX_INVITE_USES = 10;

export async function getValidInvite(
  token: string
) {
  const invite =
    await prisma.conversationInvite.findUnique({
      where: {
        token,
      },
      select: {
        id: true,
        conversationId: true,
        expiresAt: true,
        revokedAt: true,
        usageCount: true,
      },
    });

  if (!invite) {
    throw new Error("Invalid invite.");
  }

  if (invite.revokedAt) {
    throw new Error(
      "Invite has been revoked."
    );
  }

  if (
    invite.expiresAt &&
    invite.expiresAt < new Date()
  ) {
    throw new Error(
      "Invite has expired."
    );
  }

  if (
    invite.usageCount >=
    MAX_INVITE_USES
  ) {
    throw new Error(
      "Invite usage limit reached."
    );
  }

  return invite;
}
