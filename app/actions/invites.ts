"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createConversationInvite(
    conversationId: number
) {
    const user = await requireUser();

    const conversation = await requireConversationAccess(
        conversationId,
        user.id
    );

    if (conversation.ownerId !== user.id) {
        throw new Error("Only the conversation owner can create invites.");
    }

    const token = crypto.randomBytes(32).toString("hex");

    await prisma.conversationInvite.create({
        data: {
            conversationId,
            token,
            createdById: user.id,
        },
    });

    return token;
}

export async function joinConversationByInvite(
    token: string
) {
    const user = await requireUser();

    const invite = await prisma.conversationInvite.findUnique({
        where: {
            token,
        },
        select: {
            conversationId: true,
            expiresAt: true,
            revokedAt: true,
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

    const conversation = await prisma.conversation.findUnique({
        where: {
            id: invite.conversationId,
        },
        select: {
            ownerId: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found.");
    }

    if (conversation.ownerId !== user.id) {
        await prisma.conversationMember.upsert({
            where: {
                conversationId_userId: {
                    conversationId: invite.conversationId,
                    userId: user.id,
                },
            },
            update: {},
            create: {
                conversationId: invite.conversationId,
                userId: user.id,
            },
        });
    }

    redirect(`/chat/${invite.conversationId}`);
}

export async function joinConversationAsGuest(
    token: string,
    displayName: string
) {
    const name = displayName.trim();

    if (!name) {
        throw new Error("Display name is required.");
    }

    if (name.length > 50) {
        throw new Error("Display name is too long.");
    }

    // Validate the invite BEFORE creating an anonymous user.
    const invite = await prisma.conversationInvite.findUnique({
        where: {
            token,
        },
        select: {
            conversationId: true,
            expiresAt: true,
            revokedAt: true,
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

    const supabase = await createClient();

    const { data, error } =
        await supabase.auth.signInAnonymously({
            options: {
                data: {
                    name,
                },
            },
        });

    if (error) {
        throw new Error(error.message);
    }

    if (!data.user) {
        throw new Error("Could not create guest user.");
    }

    const userId = data.user.id;

    await prisma.$transaction([
        prisma.user.upsert({
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
        }),

        prisma.conversationMember.upsert({
            where: {
                conversationId_userId: {
                    conversationId: invite.conversationId,
                    userId,
                },
            },
            update: {},
            create: {
                conversationId: invite.conversationId,
                userId,
            },
        }),
    ]);

    revalidatePath(`/chat/${invite.conversationId}`);

    return {
        conversationId: invite.conversationId,
    };
}

export async function leaveConversation(
    conversationId: number
) {
    const user = await requireUser();

    const conversation = await requireConversationAccess(
        conversationId,
        user.id
    );

    if (conversation.ownerId === user.id) {
        throw new Error("The conversation owner cannot leave.");
    }

    await prisma.conversationMember.deleteMany({
        where: {
            conversationId,
            userId: user.id,
        },
    });

    revalidatePath(`/chat/${conversationId}`);
}