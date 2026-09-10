import { prisma } from "@/lib/db/prisma";

import { MAX_INVITE_USES } from "./get-valid-invite";

type JoinConversationArgs = {
  token: string;
  userId: string;
  guestName?: string;
};

class InviteMembershipConflictError extends Error {
  originalError: unknown;

  constructor(originalError: unknown) {
    super("Invite membership creation conflicted.");
    this.name = "InviteMembershipConflictError";
    this.originalError = originalError;
  }
}

function isPrismaUniqueConflict(
  error: unknown
) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String(error.code) === "P2002"
  );
}

export async function joinConversation({
  token,
  userId,
  guestName,
}: JoinConversationArgs) {
  try {
    return await prisma.$transaction(async (tx) => {
    const invite =
      await tx.conversationInvite.findUnique({
      where: {
        token,
      },
      select: {
        id: true,
        conversationId: true,
        usageCount: true,
        expiresAt: true,
        revokedAt: true,
        conversation: {
          select: {
            ownerId: true,
          },
        },
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

    const conversationId =
      invite.conversationId;

    if (
      invite.conversation.ownerId === userId
    ) {
      return {
        conversationId,
        isOwner: true,
        joined: false,
      };
    }

    const existingMembership =
      await tx.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        select: {
          id: true,
        },
      });

    if (existingMembership) {
      return {
        conversationId,
        isOwner: false,
        joined: false,
      };
    }

    if (
      invite.usageCount >=
      MAX_INVITE_USES
    ) {
      throw new Error(
        "Invite usage limit reached."
      );
    }

    const claimed =
      await tx.conversationInvite.updateMany({
        where: {
          id: invite.id,
          revokedAt: null,
          usageCount: {
            lt: MAX_INVITE_USES,
          },
          OR: [
            { expiresAt: null },
            {
              expiresAt: {
                gte: new Date(),
              },
            },
          ],
        },
        data: {
          usageCount: {
            increment: 1,
          },
        },
      });

    if (claimed.count !== 1) {
      throw new Error(
        "Invite is no longer available."
      );
    }

    if (guestName !== undefined) {
      await tx.user.upsert({
        where: {
          id: userId,
        },
        update: {
          name: guestName,
        },
        create: {
          id: userId,
          name: guestName,
        },
      });
    }

      try {
      await tx.conversationMember.create({
        data: {
          conversationId,
          userId,
        },
      });
      } catch (error) {
        if (isPrismaUniqueConflict(error)) {
          throw new InviteMembershipConflictError(
            error
          );
        }

        throw error;
      }

      return {
        conversationId,
        isOwner: false,
        joined: true,
      };
    });
  } catch (error) {
    if (
      !(error instanceof InviteMembershipConflictError)
    ) {
      throw error;
    }

    const invite =
      await prisma.conversationInvite.findUnique({
        where: {
          token,
        },
        select: {
          conversationId: true,
        },
      });

    if (invite) {
      const membership =
        await prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId:
                invite.conversationId,
              userId,
            },
          },
          select: {
            id: true,
          },
        });

      if (membership) {
        return {
          conversationId:
            invite.conversationId,
          isOwner: false,
          joined: false,
        };
      }
    }

    throw error.originalError;
  }
}
