"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { sendHumanMessage } from "@/app/actions";

import { useConversationRealtime } from "../realtime/RealtimeConversationSync";
import { createTemporaryMessageId } from "./createTemporaryMessageId";
import { useProviderGeneration } from "./useProviderGeneration";

import type {
  ChatMessage,
  ChatReply,
} from "../conversation/types";

type Props = {
  conversationId: number;
  replyTo: ChatReply | null;
  onCancelReply: () => void;
  onOptimisticMessagesChange: React.Dispatch<
    React.SetStateAction<ChatMessage[]>
  >;
  onStreamingMessagesChange: React.Dispatch<
    React.SetStateAction<ChatMessage[]>
  >;
  onSubmitAccepted: () => void;
};

export function useMessageComposer({
  conversationId,
  replyTo,
  onCancelReply,
  onOptimisticMessagesChange,
  onStreamingMessagesChange,
  onSubmitAccepted,
}: Props) {
  const router = useRouter();

  const {
    broadcastMessageCreated,
    isReady,
  } = useConversationRealtime();

  const [message, setMessage] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const {
    generateProviders,
    retryProvider:
      retryProviderGeneration,
    stopGeneration,
  } = useProviderGeneration({
    conversationId,
    onStreamingMessagesChange,
  });

  async function syncConversation() {
    if (isReady) {
      await broadcastMessageCreated();
    }
  }

  async function retryProvider(
    provider: Parameters<
      typeof retryProviderGeneration
    >[0],
    sourceMessageId: number,
    temporaryMessageId: number
  ) {
    await retryProviderGeneration(
      provider,
      sourceMessageId,
      temporaryMessageId
    );

    router.refresh();

    await syncConversation();
  }

  async function submitMessage() {
    const submittedMessage =
      message.trim();

    if (
      !submittedMessage ||
      sending
    ) {
      return;
    }

    onSubmitAccepted();

    const temporaryMessageId =
      createTemporaryMessageId();

    const optimisticMessage: ChatMessage =
      {
        id: temporaryMessageId,
        authorType: "human",
        authorName: "You",
        content: submittedMessage,
        createdAt: new Date(),
        isOwnMessage: true,
        isStreaming: false,
        isError: false,
        replyTo,
      };

    setSending(true);
    setError(null);

    onOptimisticMessagesChange(
      (current) => [
        ...current,
        optimisticMessage,
      ]
    );

    setMessage("");
    onCancelReply();

    try {
      const {
        messageId,
        providers,
      } = await sendHumanMessage(
        conversationId,
        submittedMessage,
        replyTo?.id ?? null
      );

      await syncConversation();

      await generateProviders(
        providers,
        messageId
      );

      router.refresh();

      await syncConversation();
    } catch (submitError) {
      console.error(
        submitError
      );

      onOptimisticMessagesChange(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              temporaryMessageId
          )
      );

      setMessage(
        submittedMessage
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  return {
    message,
    setMessage,
    sending,
    error,
    submitMessage,
    stopGeneration,
    retryProvider,
  };
}
