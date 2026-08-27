"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MessageList } from "./MessageList";
import { MessageComposer } from "../composer/MessageComposer";
import { useMessageComposer } from "../composer/useMessageComposer";
import {
  reconcileStreamingMessages,
} from "./reconcileStreamingMessages";

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
    optimisticMessages,
    setOptimisticMessages,
  ] = useState<ChatMessage[]>([]);

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
    onOptimisticMessagesChange:
      setOptimisticMessages,
    onStreamingMessagesChange:
      setStreamingMessages,
  });

  const retryProviderRef = useRef(
    retryProvider
  );

  useEffect(() => {
    retryProviderRef.current =
      retryProvider;
  }, [retryProvider]);

  const visibleOptimisticMessages =
    useMemo(
      () =>
        optimisticMessages.filter(
          (optimisticMessage) =>
            !messages.some(
              (persistedMessage) =>
                persistedMessage.authorType ===
                  "human" &&
                persistedMessage.isOwnMessage &&
                persistedMessage.content ===
                  optimisticMessage.content
            )
        ),
      [
        messages,
        optimisticMessages,
      ]
    );

  const visibleStreamingMessages =
    useMemo(
      () =>
        reconcileStreamingMessages(
          streamingMessages,
          messages
        ),
      [
        messages,
        streamingMessages,
      ]
    );

  const allMessages = [
    ...messages,
    ...visibleOptimisticMessages,
    ...visibleStreamingMessages,
  ];

  const handleReply = useCallback(
    (selectedMessage: ChatMessage) => {
      setReplyTo({
        id: selectedMessage.id,
        authorName:
          selectedMessage.authorName,
        content:
          selectedMessage.content,
      });
    },
    []
  );

  const handleRetry = useCallback(
    (selectedMessage: ChatMessage) => {
      if (
        !selectedMessage.provider ||
        !selectedMessage.sourceMessageId
      ) {
        return;
      }

      void retryProviderRef.current(
        selectedMessage.provider,
        selectedMessage.sourceMessageId,
        selectedMessage.id
      );
    },
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={allMessages}
        onReply={handleReply}
        onRetry={handleRetry}
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
