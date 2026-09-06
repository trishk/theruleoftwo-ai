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
  replyTo?: ChatReply | null;
};
