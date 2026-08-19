"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

const MAX_CONVERSATION_TITLE_LENGTH = 100;

export async function createChat() {
  const user = await requireUser();

  if (user.isGuest) {
    throw new Error(
      "Guests cannot create conversations."
    );
  }

  const conversation =
    await prisma.conversation.create({
      data: {
        title: "New Chat",
        ownerId: user.id,
      },
    });

  redirect(
    `/chat/${conversation.publicId}`
  );
}

export async function renameConversation(
  conversationId: number,
  title: string
) {
  const user = await requireUser();

  const trimmedTitle =
    title.trim();

  if (!trimmedTitle) {
    throw new Error(
      "Conversation title is required."
    );
  }

  if (
    trimmedTitle.length >
    MAX_CONVERSATION_TITLE_LENGTH
  ) {
    throw new Error(
      "Conversation title is too long."
    );
  }

  await requireConversationAccess(
    conversationId,
    user.id
  );

  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        updatedAt: true,
      },
    });

  if (!conversation) {
    throw new Error(
      "Conversation not found."
    );
  }

  await prisma.conversation.update({
    where: {
      id: conversationId,
    },
    data: {
      title: trimmedTitle,

      // Renaming should not move the conversation
      // to the top of the Recent list.
      updatedAt:
        conversation.updatedAt,
    },
  });

  revalidatePath(
    "/chat",
    "layout"
  );

  revalidatePath("/");
}

export async function deleteConversation(
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
      "Only the conversation owner can delete it."
    );
  }

  await prisma.conversation.delete({
    where: {
      id: conversationId,
    },
  });

  revalidatePath("/");

  redirect("/");
}