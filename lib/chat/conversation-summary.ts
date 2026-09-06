import {
  createAiParticipantIdentity,
  createHumanParticipantIdentity,
} from "@/lib/chat/participant-identity";
import type { ParticipantIdentity } from "@/lib/chat/participant-identity";

export type ConversationType =
  | "human-1:1"
  | "ai-1:1"
  | "human-group"
  | "mixed-or-multi-ai-group";

export type ConversationSummary = {
  id: number;
  publicId: string;
  title: string;
  ownerId: string;
  participants: ParticipantIdentity[];
  humanCount: number;
  aiCount: number;
  participantCount: number;
  conversationType: ConversationType;
  latestMessageAuthor: ParticipantIdentity | null;
  latestMessagePreview: string | null;
  hasUnread: boolean;
};

type HumanRecord = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

type SummaryConversation = {
  id: number;
  publicId: string;
  title: string;
  ownerId: string;
  owner: HumanRecord;
  members: Array<{ user: HumanRecord }>;
  readStates: Array<{ lastReadAt: Date }>;
  messages: Array<{
    authorType: string;
    authorId: string;
    content: string;
    createdAt: Date;
  }>;
};

type CreateConversationSummaryArgs = {
  conversation: SummaryConversation;
  aiProviderIds: string[];
  latestOtherMessageAt: Date | null;
  currentUserId: string;
  activeConversationId: number | null;
};

/**
 * Participant counting rule: every distinct enrolled human (owner plus members)
 * and every distinct AI author who has posted in the conversation counts once.
 * aiCount is the AI subset and participantCount is humanCount + aiCount.
 *
 * A new, owner-only conversation is treated as human-1:1 until another
 * participant joins or an AI posts, because the product has exactly four
 * conversation categories and no solo category.
 */
export function classifyConversation(
  humanCount: number,
  aiCount: number
): ConversationType {
  if (aiCount === 0) {
    return humanCount > 2
      ? "human-group"
      : "human-1:1";
  }

  if (humanCount === 1 && aiCount === 1) {
    return "ai-1:1";
  }

  return "mixed-or-multi-ai-group";
}

export function createConversationSummary({
  conversation,
  aiProviderIds,
  latestOtherMessageAt,
  currentUserId,
  activeConversationId,
}: CreateConversationSummaryArgs): ConversationSummary {
  const humansById = new Map<
    string,
    { human: HumanRecord; fallbackName: "Owner" | "Guest" }
  >();
  humansById.set(conversation.owner.id, {
    human: conversation.owner,
    fallbackName: "Owner",
  });
  for (const member of conversation.members) {
    if (!humansById.has(member.user.id)) {
      humansById.set(member.user.id, {
        human: member.user,
        fallbackName: "Guest",
      });
    }
  }

  const humanParticipants = [...humansById.values()].map(({
    human,
    fallbackName,
  }) =>
    createHumanParticipantIdentity({
      id: human.id,
      displayName: human.name ?? fallbackName,
      avatarUrl: human.avatarUrl,
      currentUserId,
    })
  );
  const distinctProviderIds = [...new Set(aiProviderIds)];
  const aiParticipants = distinctProviderIds.map(
    createAiParticipantIdentity
  );
  const participants = [...humanParticipants, ...aiParticipants];
  const latestMessage = conversation.messages[0] ?? null;
  const latestMessageAuthor = latestMessage
    ? latestMessage.authorType === "ai"
      ? createAiParticipantIdentity(latestMessage.authorId)
      : humanParticipants.find(
          (participant) => participant.id === latestMessage.authorId
        ) ??
        createHumanParticipantIdentity({
          id: latestMessage.authorId,
          displayName: null,
          avatarUrl: null,
          currentUserId,
        })
    : null;
  const lastReadAt = conversation.readStates[0]?.lastReadAt;
  const hasUnread =
    conversation.id !== activeConversationId &&
    Boolean(
      latestOtherMessageAt &&
        (!lastReadAt || latestOtherMessageAt > lastReadAt)
    );
  const humanCount = humanParticipants.length;
  const aiCount = aiParticipants.length;

  return {
    id: conversation.id,
    publicId: conversation.publicId,
    title: conversation.title,
    ownerId: conversation.ownerId,
    participants,
    humanCount,
    aiCount,
    participantCount: humanCount + aiCount,
    conversationType: classifyConversation(humanCount, aiCount),
    latestMessageAuthor,
    latestMessagePreview: latestMessage?.content.trim() || null,
    hasUnread,
  };
}
