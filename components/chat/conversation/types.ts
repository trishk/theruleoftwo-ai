import type { ParticipantIdentity } from "@/lib/chat/participant-identity";

export type AuthorType = "human" | "ai";

export type ChatReply = {
  id: number;
  authorName: string;
  content: string;
};

export type ChatMessage = {
  id: number;
  authorType: AuthorType;
  authorName: string;
  content: string;
  createdAt: Date;
  isOwnMessage: boolean;
  isStreaming?: boolean;
  isStopped?: boolean;
  isError?: boolean;
  isRetryable?: boolean;
  /** Explicit AI provider identity; never infer this from authorName. */
  provider?: string;
  participant?: ParticipantIdentity;
  sourceMessageId?: number;
  /** Server acknowledgement used to reconcile an optimistic human row. */
  persistedMessageId?: number;
  replyTo?: ChatReply | null;
  /** Stable React identity while a temporary row reconciles to persistence. */
  timelineKey?: string;
  /** Temporary creation time retained during reconciliation for stable order. */
  timelineCreatedAt?: Date;
  /** Temporary ID retained as the equal-timestamp ordering tie-breaker. */
  timelineOrderId?: number;
};
