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
import { buildConversationTimeline } from "./buildConversationTimeline";

import type { Provider } from "@/lib/llm/types";
import { isKnownProvider } from "@/lib/chat/participant-identity";
import type {
  ChatMessage,
  ChatReply,
} from "./types";

type Props = {
  conversationId: number;
  messages: ChatMessage[];
  configuredProviders: Provider[];
  canUseAi?: boolean;
};

export function ChatConversation({
  conversationId,
  messages,
  configuredProviders,
  canUseAi = true,
}: Props) {
  return (
    <ChatConversationSession
      key={conversationId}
      conversationId={conversationId}
      messages={messages}
      configuredProviders={configuredProviders}
      canUseAi={canUseAi}
    />
  );
}

function ChatConversationSession({
  conversationId,
  messages,
  configuredProviders,
  canUseAi = true,
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

  const [
    followBottomSignal,
    setFollowBottomSignal,
  ] = useState(0);

  const handleSubmitAccepted =
    useCallback(() => {
      setFollowBottomSignal(
        (currentSignal) =>
          currentSignal + 1
      );
    }, []);

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
    onSubmitAccepted:
      handleSubmitAccepted,
  });

  const retryProviderRef = useRef(
    retryProvider
  );

  useEffect(() => {
    retryProviderRef.current =
      retryProvider;
  }, [retryProvider]);

  const allMessages = useMemo(
    () =>
      buildConversationTimeline({
        persistedMessages: messages,
        optimisticMessages,
        streamingMessages,
      }),
    [
      messages,
      optimisticMessages,
      streamingMessages,
    ]
  );

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
        !isKnownProvider(selectedMessage.provider) ||
        !selectedMessage.sourceMessageId
      ) {
        return;
      }

      void retryProviderRef.current(
        selectedMessage.provider,
        selectedMessage.sourceMessageId,
        selectedMessage.id,
        selectedMessage.attemptId
      );
    },
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={allMessages}
        conversationId={conversationId}
        followBottomSignal={
          followBottomSignal
        }
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
        canUseAi={canUseAi}
        onMessageChange={
          setMessage
        }
        onCancelReply={() =>
          setReplyTo(null)
        }
        onSubmit={submitMessage}
        onStopGeneration={
          stopGeneration
        }
      />
    </div>
  );
}
