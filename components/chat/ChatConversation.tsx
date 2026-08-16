"use client";

import { useState } from "react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import type { Provider } from "@/lib/llm/types";
import type { ChatMessage, ChatReply } from "./types";

type Props = {
  conversationId: number;
  messages: ChatMessage[];
  configuredProviders: Provider[];
};

export function ChatConversation({
  conversationId,
  messages,
  configuredProviders,
}: Props) {
  const [replyTo, setReplyTo] = useState<ChatReply | null>(null);

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