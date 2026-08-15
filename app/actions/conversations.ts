"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

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

export async function renameConversation(
    conversationId: number,
    title: string
) {
    const user = await requireUser();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
        throw new Error("Conversation title is required.");
    }

    if (trimmedTitle.length > 100) {
        throw new Error("Conversation title is too long.");
    }

    await requireConversationAccess(
        conversationId,
        user.id
    );

    const conversation = await prisma.conversation.findUnique({
        where: {
            id: conversationId,
        },
        select: {
            updatedAt: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found.");
    }

    await prisma.conversation.update({
        where: {
            id: conversationId,
        },
        data: {
            title: trimmedTitle,
            updatedAt: conversation.updatedAt,
        },
    });
    revalidatePath(`/chat/${conversationId}`);
    revalidatePath("/");
}

export async function deleteConversation(
    conversationId: number
) {
    const user = await requireUser();

    await requireConversationAccess(
        conversationId,
        user.id
    );

    await prisma.conversation.delete({
        where: {
            id: conversationId,
        },
    });

    revalidatePath("/");
    redirect("/");
}