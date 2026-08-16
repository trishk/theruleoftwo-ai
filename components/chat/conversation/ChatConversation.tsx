"use client";

import { useEffect, useState } from "react";

import { MessageList } from "./MessageList";
import { MessageComposer } from "../composer/MessageComposer";
import { useMessageComposer } from "../composer/useMessageComposer";

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

  const {
    message,
    setMessage,
    sending,
    error,
    submitMessage,
    stopGeneration,
    retryProvider,
  } = useMessageComposer({
    conversationId,
    replyTo,
    onCancelReply: () =>
      setReplyTo(null),
    onStreamingMessagesChange:
      setStreamingMessages,
  });

  useEffect(() => {
    if (
      streamingMessages.length === 0
    ) {
      return;
    }

    setStreamingMessages(
      (current) =>
        current.filter(
          (streamingMessage) =>
            !messages.some(
              (message) =>
                message.authorType ===
                  "ai" &&
                message.authorName ===
                  streamingMessage.authorName &&
                message.content ===
                  streamingMessage.content
            )
        )
    );
  }, [
    messages,
    streamingMessages.length,
  ]);

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
            content:
              message.content,
          })
        }
        onRetry={(message) => {
          if (
            !message.provider ||
            !message.sourceMessageId
          ) {
            return;
          }

          void retryProvider(
            message.provider,
            message.sourceMessageId,
            message.id
          );
        }}
      />

      <MessageComposer
        message={message}
        sending={sending}
        error={error}
        replyTo={replyTo}
        configuredProviders={
          configuredProviders
        }
        onMessageChange={
          setMessage
        }
        onCancelReply={() =>
          setReplyTo(null)
        }
        onSubmit={
          submitMessage
        }
        onStopGeneration={
          stopGeneration
        }
      />
    </div>
  );
}