"use client";

import {
  useMemo,
  useState,
} from "react";

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

  const visibleStreamingMessages =
    useMemo(
      () =>
        streamingMessages.filter(
          (streamingMessage) =>
            !messages.some(
              (persistedMessage) =>
                persistedMessage.authorType ===
                  "ai" &&
                persistedMessage.authorName ===
                  streamingMessage.authorName &&
                persistedMessage.content ===
                  streamingMessage.content
            )
        ),
      [
        messages,
        streamingMessages,
      ]
    );

  const allMessages = [
    ...messages,
    ...visibleStreamingMessages,
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