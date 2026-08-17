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

  if (conversation.ownerId !== user.id) {
    throw new Error(
      "Only the conversation owner can create invites."
    );
  }

  const token =
    crypto.randomBytes(32).toString("hex");

  const expiresAt = new Date(
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
  const user = await requireUser();

  const invite =
    await getValidInvite(token);

  await joinConversation({
    conversationId:
      invite.conversationId,
    userId:
      user.id,
  });

  redirect(
    `/chat/${invite.conversationId}`
  );
}

export async function joinConversationAsGuest(
  token: string,
  displayName: string
) {
  const name =
    displayName.trim();

  if (!name) {
    throw new Error(
      "Display name is required."
    );
  }

  if (name.length > 50) {
    throw new Error(
      "Display name is too long."
    );
  }

  // Validate before creating an anonymous Supabase user.
  const invite =
    await getValidInvite(token);

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.signInAnonymously({
      options: {
        data: {
          name,
        },
      },
    });

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!data.user) {
    throw new Error(
      "Could not create guest user."
    );
  }

  const userId =
    data.user.id;

  await prisma.user.upsert({
    where: {
      id: userId,
    },
    update: {
      name,
    },
    create: {
      id: userId,
      name,
    },
  });

  await joinConversation({
    conversationId:
      invite.conversationId,
    userId,
  });

  revalidatePath(
    `/chat/${invite.conversationId}`
  );

  return {
    conversationId:
      invite.conversationId,
  };
}

export async function leaveConversation(
  conversationId: number
) {
  const user = await requireUser();

  const conversation =
    await requireConversationAccess(
      conversationId,
      user.id
    );

  if (conversation.ownerId === user.id) {
    throw new Error(
      "The conversation owner cannot leave."
    );
  }

  await prisma.conversationMember.deleteMany({
    where: {
      conversationId,
      userId: user.id,
    },
  });

  revalidatePath(
    `/chat/${conversationId}`
  );
}