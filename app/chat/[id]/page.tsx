import { prisma } from "@/lib/db/prisma";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { RealtimeConversationSync } from "@/components/chat/RealtimeConversationSync";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { notFound, redirect } from "next/navigation";

type Props = {
    params: Promise<{
        id: string;
    }>;
};

export default async function ChatPage({ params }: Props) {
    const user = await requireUser();
    const { id } = await params;
    const conversationId = Number(id);

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
        notFound();
    }

    try {
        await requireConversationAccess(
            conversationId,
            user.id
        );
    } catch {
        if (user.isGuest) {
            const membership =
                await prisma.conversationMember.findFirst({
                    where: {
                        userId: user.id,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    select: {
                        conversationId: true,
                    },
                });

            if (membership) {
                redirect(`/chat/${membership.conversationId}`);
            }
        }

        notFound();
    }
    const conversation = await prisma.conversation.findUnique({
        where: {
            id: conversationId,
        },
        include: {
            owner: {
                select: {
                    name: true,
                },
            },
            members: {
                include: {
                    user: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
            messages: {
                orderBy: {
                    createdAt: "asc",
                },
                include: {
                    replyTo: true,
                },
            },
        },
    });

    if (!conversation) {
        notFound();
    }

    const participants = [
        conversation.owner.name ?? "Owner",
        ...conversation.members.map(
            (member) => member.user.name ?? "Guest"
        ),
    ];

    const chats = user.isGuest
        ? []
        : await prisma.conversation.findMany({
            where: {
                OR: [
                    {
                        ownerId: user.id,
                    },
                    {
                        members: {
                            some: {
                                userId: user.id,
                            },
                        },
                    },
                ],
            },
            orderBy: {
                updatedAt: "desc",
            },
        });

    const integrations =
        await prisma.userIntegration.findMany({
            where: {
                userId: conversation.ownerId,
            },
        });

    const configuredProviders = integrations
        .filter(
            (integration) =>
                integration.encryptedApiKey &&
                integration.keyIv &&
                integration.keyAuthTag
        )
        .map((integration) => integration.provider)
        .filter(
            (
                provider
            ): provider is
                | "openai"
                | "anthropic"
                | "google" =>
                provider === "openai" ||
                provider === "anthropic" ||
                provider === "google"
        );

    const humanAuthorIds = [
        ...new Set(
            conversation.messages
                .filter(
                    (message) =>
                        message.authorType === "human"
                )
                .map((message) => message.authorId)
        ),
    ];

    const humanAuthors = await prisma.user.findMany({
        where: {
            id: {
                in: humanAuthorIds,
            },
        },
        select: {
            id: true,
            name: true,
        },
    });

    const authorNames = new Map(
        humanAuthors.map((author) => [
            author.id,
            author.name,
        ])
    );

    const getAuthorName = (authorId: string) => {
        if (authorId === "openai") {
            return "ChatGPT";
        }

        if (authorId === "anthropic") {
            return "Claude";
        }

        if (authorId === "google") {
            return "Gemini";
        }

        return (
            authorNames.get(authorId) ??
            "Unknown user"
        );
    };

    const messages = conversation.messages.map(
        (message) => ({
            id: message.id,
            authorType:
                message.authorType === "ai"
                    ? ("ai" as const)
                    : ("human" as const),
            authorName: getAuthorName(
                message.authorId
            ),
            content: message.content,
            createdAt: message.createdAt,
            isOwnMessage: message.authorId === user.id,
            replyTo: message.replyTo
                ? {
                    id: message.replyTo.id,
                    authorName: getAuthorName(
                        message.replyTo.authorId
                    ),
                    content: message.replyTo.content,
                }
                : null,
        })
    );

    const chatContent = (
        <RealtimeConversationSync
            conversationId={conversation.id}
        >
            <div className="flex h-dvh min-h-0 flex-col">
                <ChatHeader
                    conversationId={conversation.id}
                    title={conversation.title}
                    isOwner={conversation.ownerId === user.id}
                    isGuest={user.isGuest}
                    participants={participants}
                />

                <ChatConversation
                    conversationId={conversation.id}
                    messages={messages}
                    configuredProviders={configuredProviders}
                />
            </div>
        </RealtimeConversationSync>
    );

    if (user.isGuest) {
        return chatContent;
    }

    return (
        <ChatShell
            sidebar={
                <ChatSidebar
                    chats={chats}
                    currentUserId={user.id}
                />
            }
        >
            {chatContent}
        </ChatShell>
    );
}