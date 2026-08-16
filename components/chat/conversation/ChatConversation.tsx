"use client";

import { useEffect, useState } from "react";

import { MessageList } from "./MessageList";
import { MessageComposer } from "../composer/MessageComposer";
import type { Provider } from "@/lib/llm/types";
import type {
  ChatMessage,
  ChatReply,
} from "./types";

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
  const [replyTo, setReplyTo] =
    useState<ChatReply | null>(null);

  const [
    streamingMessages,
    setStreamingMessages,
  ] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (streamingMessages.length === 0) {
      return;
    }

    setStreamingMessages((current) =>
      current.filter((streamingMessage) => {
        return !messages.some(
          (message) =>
            message.authorType === "ai" &&
            message.authorName ===
              streamingMessage.authorName &&
            message.content ===
              streamingMessage.content
        );
      })
    );
  }, [messages, streamingMessages.length]);

  const allMessages = [
    ...messages,
    ...streamingMessages,
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={allMessages}
        onReply={(message) =>
          setReplyTo({
            id: message.id,
            authorName:
              message.authorName,
            content: message.content,
          })
        }
      />

      <MessageComposer
        conversationId={conversationId}
        replyTo={replyTo}
        configuredProviders={
          configuredProviders
        }
        onCancelReply={() =>
          setReplyTo(null)
        }
        onStreamingMessagesChange={
          setStreamingMessages
        }
      />
    </div>
  );
}