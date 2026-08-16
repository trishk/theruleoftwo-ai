"use client";

import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import type { Provider } from "@/lib/llm/types";

type Message = {
  id: number;
  authorType: "human" | "ai";
  authorName: string;
  content: string;
  createdAt: Date;
  isOwnMessage: boolean;
  replyTo?: {
    id: number;
    authorName: string;
    content: string;
  } | null;
};

type Props = {
  conversationId: number;
  messages: Message[];
  configuredProviders: Provider[];
};

export function ChatConversation({
  conversationId,
  messages,
  configuredProviders,
}: Props) {
  const [replyTo, setReplyTo] = useState<{
    id: number;
    authorName: string;
    content: string;
  } | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={messages}
        onReply={(message) =>
          setReplyTo({
            id: message.id,
            authorName: message.authorName,
            content: message.content,
          })
        }
      />

      <MessageComposer
        conversationId={conversationId}
        replyTo={replyTo}
        configuredProviders={configuredProviders}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}