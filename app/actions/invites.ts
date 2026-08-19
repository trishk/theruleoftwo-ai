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

  await prisma.conversationInvite.create({
    data: {
      conversationId,
      token,
      createdById: user.id,
      expiresAt,
    },
  });

  return token;
}

export async function joinConversationByInvite(
  token: string
) {
  const user =
    await requireUser();

  const invite =
    await getValidInvite(
      token
    );

  await joinConversation({
    conversationId:
      invite.conversationId,
    userId: user.id,
  });

  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: invite.conversationId,
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

  const invite =
    await getValidInvite(
      token
    );

  const {
    userId,
  } =
    await createGuestUser(
      name
    );

  await joinConversation({
    conversationId:
      invite.conversationId,
    userId,
  });

  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: invite.conversationId,
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
      invite.conversationId,
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