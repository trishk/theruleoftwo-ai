import {
  notFound,
  redirect,
} from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { markConversationRead } from "@/lib/conversations/mark-conversation-read";

import { ChatHeader } from "@/components/chat/navigation/ChatHeader";
import { ChatConversation } from "@/components/chat/conversation/ChatConversation";
import { ChatShell } from "@/components/chat/navigation/ChatShell";
import { ChatSidebar } from "@/components/chat/navigation/ChatSidebar";
import { RealtimeConversationSync } from "@/components/chat/realtime/RealtimeConversationSync";
import { RealtimeSidebarSync } from "@/components/chat/realtime/RealtimeSidebarSync";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ChatPage({
  params,
}: Props) {
  const user = await requireUser();

  const { id: publicId } = await params;

  const conversationLookup =
    await prisma.conversation.findUnique({
      where: {
        publicId,
      },
      select: {
        id: true,
      },
    });

  if (!conversationLookup) {
    notFound();
  }

  const conversationId =
    conversationLookup.id;

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
            conversation: {
              select: {
                publicId: true,
              },
            },
          },
        });

      if (membership) {
        redirect(
          `/chat/${membership.conversation.publicId}`
        );
      }
    }

    notFound();
  }

  await markConversationRead({
    conversationId,
    userId: user.id,
  });

  const conversation =
    await prisma.conversation.findUnique({
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
      (member) =>
        member.user.name ?? "Guest"
    ),
  ];

  const accessibleChats =
    await prisma.conversation.findMany({
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
      select: {
        id: true,
        publicId: true,
        title: true,
        ownerId: true,
        readStates: {
          where: {
            userId: user.id,
          },
          select: {
            lastReadAt: true,
          },
          take: 1,
        },
        messages: {
          where: {
            authorId: {
              not: user.id,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            createdAt: true,
          },
          take: 1,
        },
      },
    });

  const chats =
    accessibleChats.map((chat) => {
      const lastReadAt =
        chat.readStates[0]?.lastReadAt;

      const latestOtherMessageAt =
        chat.messages[0]?.createdAt;

      const hasUnread =
        chat.id !== conversationId &&
        Boolean(
          latestOtherMessageAt &&
            (!lastReadAt ||
              latestOtherMessageAt >
                lastReadAt)
        );

      return {
        id: chat.id,
        publicId: chat.publicId,
        title: chat.title,
        ownerId: chat.ownerId,
        hasUnread,
      };
    });

  const integrations =
    await prisma.userIntegration.findMany({
      where: {
        userId:
          conversation.ownerId,
      },
    });

  const configuredProviders =
    integrations
      .filter(
        (integration) =>
          integration.encryptedApiKey &&
          integration.keyIv &&
          integration.keyAuthTag
      )
      .map(
        (integration) =>
          integration.provider
      )
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
            message.authorType ===
            "human"
        )
        .map(
          (message) =>
            message.authorId
        )
    ),
  ];

  const humanAuthors =
    await prisma.user.findMany({
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

  function getAuthorName(
    authorId: string
  ) {
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
  }

  const messages =
    conversation.messages.map(
      (message) => ({
        id: message.id,
        authorType:
          message.authorType === "ai"
            ? ("ai" as const)
            : ("human" as const),
        authorName:
          getAuthorName(
            message.authorId
          ),
        content:
          message.content,
        createdAt:
          message.createdAt,
        isOwnMessage:
          message.authorId ===
          user.id,
        replyTo:
          message.replyTo
            ? {
                id:
                  message.replyTo.id,
                authorName:
                  getAuthorName(
                    message.replyTo
                      .authorId
                  ),
                content:
                  message.replyTo
                    .content,
              }
            : null,
      })
    );

  const chatContent = (
    <div className="flex h-dvh min-h-0 flex-col">
      <ChatHeader
        conversationId={
          conversation.id
        }
        title={
          conversation.title
        }
        isOwner={
          conversation.ownerId ===
          user.id
        }
        isGuest={
          user.isGuest
        }
        participants={
          participants
        }
      />

      <ChatConversation
        conversationId={
          conversation.id
        }
        messages={
          messages
        }
        configuredProviders={
          configuredProviders
        }
      />
    </div>
  );

  return (
    <RealtimeSidebarSync
      conversationIds={chats.map(
        (chat) => chat.id
      )}
      activeConversationId={
        conversationId
      }
    >
      <RealtimeConversationSync
        conversationId={
          conversationId
        }
      >
        <ChatShell
          sidebar={
            <ChatSidebar
              chats={
                chats
              }
              currentUserId={
                user.id
              }
              isGuest={
                user.isGuest
              }
            />
          }
        >
          {chatContent}
        </ChatShell>
      </RealtimeConversationSync>
    </RealtimeSidebarSync>
  );
}