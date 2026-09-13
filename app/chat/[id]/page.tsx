import {
  notFound,
  redirect,
} from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { markConversationReadAfterAccessCheck } from "@/lib/conversations/mark-conversation-read";
import {
  createAiParticipantIdentity,
  createHumanParticipantIdentity,
} from "@/lib/chat/participant-identity";
import { getConversationSummaries } from "@/lib/chat/get-conversation-summaries";
import { recoverStaleGenerationsForConversation } from "@/lib/chat-stream/generation-lifecycle";

import { ChatHeader } from "@/components/chat/navigation/ChatHeader";
import { ChatConversation } from "@/components/chat/conversation/ChatConversation";
import { ChatShell } from "@/components/chat/navigation/ChatShell";
import { ChatSidebar } from "@/components/chat/navigation/ChatSidebar";
import { RealtimeConversationSync } from "@/components/chat/realtime/RealtimeConversationSync";
import { RealtimeSidebarSync } from "@/components/chat/realtime/RealtimeSidebarSync";
import { getConversationUsageSummary } from "@/lib/llm/usage/conversation-usage";
import { canAccessSettings } from "@/lib/auth/settings-access";

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

  let conversationAccess: Awaited<
    ReturnType<
      typeof requireConversationAccess
    >
  >;

  try {
    conversationAccess =
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

  await markConversationReadAfterAccessCheck({
    conversationId,
    userId: user.id,
  });
  await recoverStaleGenerationsForConversation(conversationId);

  const ownerId =
    conversationAccess.ownerId;

  const conversation =
    await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        title: true,
        allowMemberAiUsage: true,
        messages: {
          orderBy: [
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            authorType: true,
            authorId: true,
            content: true,
            createdAt: true,
            replyTo: {
              select: {
                id: true,
                authorType: true,
                authorId: true,
                content: true,
              },
            },
            generationAttempt: {
              select: {
                id: true,
                status: true,
                generation: { select: { sourceMessageId: true } },
              },
            },
          },
        },
      },
    });

  if (!conversation) {
    notFound();
  }

  const activeInvite =
    ownerId === user.id
      ? await prisma.conversationInvite.findFirst({
          where: {
            conversationId,
            revokedAt: null,
            usageCount: {
              lt: 10,
            },
            OR: [
              { expiresAt: null },
              {
                expiresAt: {
                  gt: new Date(),
                },
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            token: true,
            usageCount: true,
          },
        })
      : null;
  const usageSummary = ownerId === user.id
    ? await getConversationUsageSummary(conversationId)
    : null;

  const chats =
    await getConversationSummaries({
      currentUserId: user.id,
      activeConversationId: conversationId,
    });

  const integrations =
    await prisma.userIntegration.findMany({
      where: {
        userId: ownerId,
      },
      select: {
        provider: true,
        encryptedApiKey: true,
        keyIv: true,
        keyAuthTag: true,
        connectionMode: true,
      },
    });

  const ownerPersonalAgent = await prisma.personalAgent.findUnique({ where: { userId: ownerId }, select: { revokedAt: true } });
  const configuredProviders =
    integrations
      .filter(
        (integration) =>
          ((integration.provider === "google" && integration.connectionMode === "personal" && ownerPersonalAgent && !ownerPersonalAgent.revokedAt) || (integration.encryptedApiKey &&
          integration.keyIv &&
          integration.keyAuthTag))
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
        avatarUrl: true,
      },
    });

  const humanParticipants = new Map(
    humanAuthors.map((author) => [
      author.id,
      createHumanParticipantIdentity({
        id: author.id,
        displayName: author.name,
        avatarUrl: author.avatarUrl,
        currentUserId: user.id,
      }),
    ])
  );

  function getParticipant(
    authorType: string,
    authorId: string
  ) {
    if (authorType === "ai") {
      return createAiParticipantIdentity(authorId);
    }

    return (
      humanParticipants.get(authorId) ??
      createHumanParticipantIdentity({
        id: authorId,
        displayName: null,
        avatarUrl: null,
        currentUserId: user.id,
      })
    );
  }

  const messages =
    conversation.messages.map(
      (message) => {
        const participant =
          getParticipant(
            message.authorType,
            message.authorId
          );

        return {
          id: message.id,
          authorType:
            message.authorType === "ai"
              ? ("ai" as const)
              : ("human" as const),
          authorName: participant.displayName,
          participant,
          provider:
            message.authorType === "ai"
              ? message.authorId
              : undefined,
          content: message.content,
          createdAt: message.createdAt,
          attemptId: message.generationAttempt?.id,
          outputMessageId: message.generationAttempt ? message.id : undefined,
          sourceMessageId: message.generationAttempt?.generation.sourceMessageId,
          generationStatus: message.generationAttempt?.status as "pending" | "streaming" | "completed" | "failed" | "stopped" | undefined,
          isStreaming: message.generationAttempt?.status === "pending" || message.generationAttempt?.status === "streaming",
          isStopped: message.generationAttempt?.status === "stopped",
          isError: message.generationAttempt?.status === "failed",
          isOwnMessage:
            message.authorId === user.id,
          replyTo: message.replyTo
            ? {
                id: message.replyTo.id,
                authorName: getParticipant(
                  message.replyTo.authorType,
                  message.replyTo.authorId
                ).displayName,
                content: message.replyTo.content,
              }
            : null,
        };
      }
    );

  const chatContent = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ChatHeader
        conversationId={
          conversation.id
        }
        title={
          conversation.title
        }
        isOwner={
          ownerId ===
          user.id
        }
        allowMemberAiUsage={
          conversation.allowMemberAiUsage
        }
        activeInvite={
          activeInvite
        }
        usageSummary={usageSummary}
        summary={chats.find(
          (chat) => chat.id === conversation.id
        )}
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
        canUseAi={ownerId === user.id || conversation.allowMemberAiUsage}
      />
    </div>
  );

  return (
    <RealtimeSidebarSync
      conversationPublicIds={chats.map(
        (chat) => chat.publicId
      )}
      activeConversationPublicId={
        publicId
      }
    >
      <RealtimeConversationSync
        conversationPublicId={
          publicId
        }
      >
        <ChatShell
          constrainToViewport
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
              canAccessSettings={canAccessSettings({
                userId: user.id,
                isGuest: user.isGuest,
                conversations: chats,
              })}
            />
          }
        >
          {chatContent}
        </ChatShell>
      </RealtimeConversationSync>
    </RealtimeSidebarSync>
  );
}
