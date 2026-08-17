import { prisma } from "@/lib/db/prisma";

export async function getValidInvite(
  token: string
) {
  const invite =
    await prisma.conversationInvite.findUnique({
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

  return invite;
}