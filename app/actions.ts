"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { askLLM } from "@/lib/llm/registry";
import { extractMentions } from "@/lib/llm/mentions";
import { stripMention } from "@/lib/llm/prompt";

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

  if (!trimmedContent) return;

  // Save human message
  await prisma.message.create({
    data: {
      conversationId,
      authorType: "human",
      authorId: "hefe",
      content: trimmedContent,
    },
  });

  // Detect mentioned AI providers
  const providers = extractMentions(trimmedContent);

  if (providers.length > 0) {
    // Load conversation history once
    const history = await prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Ask every mentioned provider
    for (const provider of providers) {
      const messages = history.map((message) => ({
        role:
          message.authorType === "ai"
            ? ("assistant" as const)
            : ("user" as const),

        content:
          message.authorType === "human"
            ? stripMention(message.content, provider)
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

  // Move active conversation to top of chat list
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