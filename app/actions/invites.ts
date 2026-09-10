"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { createClient } from "@/lib/supabase/server";

import { getValidInvite } from "@/lib/invites/get-valid-invite";
import { joinConversation } from "@/lib/invites/join-conversation";
import {
  createGuestUser,
  validateGuestDisplayName,
} from "@/lib/invites/create-guest-user";
import { leaveConversationMembership } from "@/lib/invites/leave-conversation";
import { withInviteLock } from "@/lib/invites/with-invite-lock";

const INVITE_EXPIRATION_MS =
  7 * 24 * 60 * 60 * 1000;

export async function createConversationInvite(
  conversationId: number
) {
  const user = await requireUser();

  const conversation =
    await requireConversationAccess(
      conversationId,
      user.id
    );

  if (
    conversation.ownerId !==
    user.id
  ) {
    throw new Error(
      "Only the conversation owner can create invites."
    );
  }

  const token =
    crypto
      .randomBytes(32)
      .toString("hex");

  const expiresAt =
    new Date(
      Date.now() +
      INVITE_EXPIRATION_MS
    );

  const invite =
    await prisma.conversationInvite.create({
      data: {
        conversationId,
        token,
        createdById: user.id,
        expiresAt,
      },
      select: {
        id: true,
      },
    });

  return {
    id: invite.id,
    token,
    usageCount: 0,
  };
}

export async function revokeConversationInvite(
  inviteId: number
) {
  const user = await requireUser();

  if (
    !Number.isInteger(inviteId) ||
    inviteId <= 0
  ) {
    throw new Error("Invalid invite id.");
  }

  const revoked =
    await prisma.conversationInvite.updateMany({
      where: {
        id: inviteId,
        revokedAt: null,
        conversation: {
          ownerId: user.id,
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

  if (revoked.count !== 1) {
    throw new Error(
      "Invite not found."
    );
  }

  revalidatePath("/chat/[id]", "page");
}

export async function joinConversationByInvite(
  token: string
) {
  const user =
    await requireUser();

  const joined = await withInviteLock(
    token,
    () =>
      joinConversation({
        token,
        userId: user.id,
      })
  );

  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: joined.conversationId,
      },
      select: {
        publicId: true,
      },
    });

  if (!conversation) {
    throw new Error(
      "Conversation not found."
    );
  }

  redirect(
    `/chat/${conversation.publicId}`
  );
}

export async function joinConversationAsGuest(
  token: string,
  displayName: string
) {
  const name =
    validateGuestDisplayName(
      displayName
    );

  const joined = await withInviteLock(
    token,
    async () => {
      await getValidInvite(token);

      const { userId } =
        await createGuestUser(name);

      try {
        return await joinConversation({
          token,
          userId,
          guestName: name,
        });
      } catch (error) {
        try {
          const supabase =
            await createClient();
          const { error: signOutError } =
            await supabase.auth.signOut();

          if (signOutError) {
            console.error(
              "Failed to sign out guest after invite join failure:",
              signOutError
            );
          }
        } catch (cleanupError) {
          console.error(
            "Failed to sign out guest after invite join failure:",
            cleanupError
          );
        }

        throw error;
      }
    }
  );

  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: joined.conversationId,
      },
      select: {
        publicId: true,
      },
    });

  if (!conversation) {
    throw new Error(
      "Conversation not found."
    );
  }

  revalidatePath(
    "/chat",
    "layout"
  );

  return {
    conversationId:
      joined.conversationId,
    conversationPublicId:
      conversation.publicId,
  };
}

export async function leaveConversation(
  conversationId: number
) {
  const user =
    await requireUser();

  const conversation =
    await requireConversationAccess(
      conversationId,
      user.id
    );

  if (
    conversation.ownerId ===
    user.id
  ) {
    throw new Error(
      "The conversation owner cannot leave."
    );
  }

  const {
    nextConversationId,
    nextConversationPublicId,
  } =
    await leaveConversationMembership({
      conversationId,
      userId: user.id,
    });

  revalidatePath(
    "/chat",
    "layout"
  );

  revalidatePath("/");

  if (
    nextConversationId === null &&
    user.isGuest
  ) {
    const supabase =
      await createClient();

    const {
      error:
      signOutError,
    } =
      await supabase.auth.signOut();

    if (signOutError) {
      console.error(
        "Failed to sign out guest after leaving last conversation:",
        signOutError
      );
    }

    return {
      nextConversationId: null,
      nextConversationPublicId: null,
      signedOut: true,
    };
  }

  return {
    nextConversationId,
    nextConversationPublicId,
    signedOut: false,
  };
}
