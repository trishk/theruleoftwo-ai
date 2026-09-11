"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import {
  extractMentions,
  removeAiMentions,
} from "@/lib/llm/mentions";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

async function saveHumanMessage(
  conversationId: number,
  userId: string,
  content: string,
  replyToId: number | null,
  clientMessageId: string
) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error("Message is required.");
  }

  if (trimmedContent.length > 4000) {
    throw new Error("Message is too long.");
  }

  const conversationRecord =
    await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        title: true,
      },
    });

  if (!conversationRecord) {
    throw new Error(
      "Conversation not found."
    );
  }

  if (replyToId != null) {
    const replyToMessage =
      await prisma.message.findFirst({
        where: {
          id: replyToId,
          conversationId,
        },
        select: {
          id: true,
        },
      });

    if (!replyToMessage) {
      throw new Error(
        "Invalid reply target."
      );
    }
  }

  const existingMessageCount =
    conversationRecord.title ===
    "New Chat"
      ? await prisma.message.count({
          where: {
            conversationId,
          },
        })
      : null;

  const canonicalReplyToId = replyToId ?? null;
  const clientPayloadHash = createHash("sha256")
    .update(JSON.stringify({ content: trimmedContent, replyToId: canonicalReplyToId }))
    .digest("hex");
  let createdMessage;
  let outcome: "created" | "duplicate" = "created";

  try {
    createdMessage = await prisma.message.create({
      data: {
        conversationId,
        authorType: "human",
        authorId: userId,
        content: trimmedContent,
        replyToId: canonicalReplyToId,
        clientMessageId,
        clientPayloadHash,
      },
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;

    if (code !== "P2002") {
      throw error;
    }

    const existing = await prisma.message.findUnique({
      where: {
        conversationId_authorId_clientMessageId: {
          conversationId,
          authorId: userId,
          clientMessageId,
        },
      },
    });

    if (
      !existing ||
      existing.authorType !== "human" ||
      existing.clientPayloadHash !== clientPayloadHash ||
      existing.content !== trimmedContent ||
      existing.replyToId !== canonicalReplyToId
    ) {
      throw new Error("CLIENT_MESSAGE_ID_CONFLICT");
    }

    createdMessage = existing;
    outcome = "duplicate";
  }

  if (
    outcome === "created" &&
    existingMessageCount === 0 &&
    conversationRecord.title === "New Chat"
  ) {
    const titleContent =
      removeAiMentions(trimmedContent)
        .replace(/\s+/g, " ")
        .trim();

    const generatedTitle =
      !/[\p{L}\p{N}]/u.test(titleContent)
        ? "New conversation"
        : titleContent.length > 50
        ? `${titleContent.slice(0, 47)}...`
        : titleContent;

    await prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        title: generatedTitle,
      },
    });
  }

  return {
    messageId: createdMessage.id,
    outcome,
    clientMessageId,
    content: trimmedContent,
    providers:
      extractMentions(trimmedContent),
  };
}

export async function sendHumanMessage(
  conversationId: number,
  content: string,
  replyToId: number | null,
  clientMessageId: string
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(clientMessageId)) {
    throw new Error("INVALID_CLIENT_MESSAGE_ID");
  }
  const user = await requireUser();

  await requireConversationAccess(
    conversationId,
    user.id
  );

  const {
    messageId,
    outcome,
    clientMessageId: persistedClientMessageId,
    providers,
  } = await saveHumanMessage(
    conversationId,
    user.id,
    content,
    replyToId,
    clientMessageId
  );

  if (outcome === "created") await prisma.conversation.update({
    where: {
      id: conversationId,
    },
    data: {
      updatedAt: new Date(),
    },
  });

  revalidatePath("/");

  return {
    outcome,
    messageId,
    clientMessageId: persistedClientMessageId,
    providers,
  };
}
