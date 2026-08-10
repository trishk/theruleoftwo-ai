"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { askLLM } from "@/lib/llm/registry";
import { extractMentions } from "@/lib/llm/mentions";
import { stripMentions } from "@/lib/llm/prompt";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export async function createChat() {
  const user = await requireUser();

  const conversation = await prisma.conversation.create({
    data: {
      title: "New Chat",
      ownerId: user.id,
    },
  });

  redirect(`/chat/${conversation.id}`);
}

export async function sendMessage(
  conversationId: number,
  content: string
) {
  const user = await requireUser();

  const trimmedContent = content.trim();

  if (!trimmedContent) return;

  if (trimmedContent.length > 4000) {
    throw new Error("Message is too long.");
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  await prisma.message.create({
    data: {
      conversationId,
      authorType: "human",
      authorId: user.id,
      content: trimmedContent,
    },
  });

  const providers = extractMentions(trimmedContent);

  if (providers.length > 0) {
    const history = await prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    history.reverse();

    for (const provider of providers) {
      const messages = history.map((message) => ({
        role:
          message.authorType === "ai"
            ? ("assistant" as const)
            : ("user" as const),

        content:
          message.authorType === "human"
            ? stripMentions(message.content)
            : message.content,
      }));

      const response = await askLLM({
        provider,
        messages,
      });

      await prisma.message.create({
        data: {
          conversationId,
          authorType: "ai",
          authorId: response.provider,
          content: response.text,
        },
      });
    }
  }

  await prisma.conversation.update({
    where: {
      id: conversationId,
    },
    data: {
      updatedAt: new Date(),
    },
  });

  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/");
}

export async function signOut() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/login");
}