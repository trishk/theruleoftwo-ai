"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";

export async function createChat() {
  const conversation = await prisma.conversation.create({
    data: {
      title: "New Chat",
    },
  });

  redirect(`/chat/${conversation.id}`);
}

export async function sendMessage(
  conversationId: number,
  content: string
) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return;
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        authorType: "human",
        authorId: "hefe",
        content: trimmedContent,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/");
}