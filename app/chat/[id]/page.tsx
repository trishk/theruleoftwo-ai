import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";

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

    await requireConversationAccess(
    conversationId,
    user.id
);

const conversation = await prisma.conversation.findFirst({
    where: {
        id: conversationId,
        ownerId: user.id,
    },
    include: {
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

    const chats = await prisma.conversation.findMany({
        where: {
            ownerId: user.id,
        },
        orderBy: {
            updatedAt: "desc",
        },
    });

    const integrations = await prisma.userIntegration.findMany({
        where: {
            userId: user.id,
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
            (provider): provider is "openai" | "anthropic" | "google" =>
                provider === "openai" ||
                provider === "anthropic" ||
                provider === "google"
        );

    const getAuthorName = (authorId: string) => {
        if (authorId === user.id) {
            return user.name ?? "You";
        }

        if (authorId === "openai") {
            return "ChatGPT";
        }

        if (authorId === "anthropic") {
            return "Claude";
        }

        if (authorId === "google") {
            return "Gemini";
        }

        return authorId;
    };

    const messages = conversation.messages.map((message) => ({
        id: message.id,
        authorType:
            message.authorType === "ai"
                ? ("ai" as const)
                : ("human" as const),
        authorName: getAuthorName(message.authorId),
        content: message.content,
        createdAt: message.createdAt,
        replyTo: message.replyTo
            ? {
                id: message.replyTo.id,
                authorName: getAuthorName(message.replyTo.authorId),
                content: message.replyTo.content,
            }
            : null,
    }));

    return (
        <ChatShell sidebar={<ChatSidebar chats={chats} />}>
            <div className="flex h-dvh min-h-0 flex-col">
                <ChatHeader
                    title={conversation.title}
                />
                <ChatConversation
                    conversationId={conversation.id}
                    messages={messages}
                    configuredProviders={configuredProviders}
                />
            </div>
        </ChatShell>
    );
}