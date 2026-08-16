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
  replyTo?: ChatReply | null;
};