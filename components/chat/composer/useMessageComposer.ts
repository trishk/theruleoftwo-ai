"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { sendHumanMessage } from "@/app/actions";

import { useConversationRealtime } from "../realtime/RealtimeConversationSync";
import { useProviderGeneration } from "./useProviderGeneration";

import type {
  ChatMessage,
  ChatReply,
} from "../conversation/types";

type Props = {
  conversationId: number;
  replyTo: ChatReply | null;
  onCancelReply: () => void;
  onStreamingMessagesChange: React.Dispatch<
    React.SetStateAction<ChatMessage[]>
  >;
};

export function useMessageComposer({
  conversationId,
  replyTo,
  onCancelReply,
  onStreamingMessagesChange,
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
    router.refresh();

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

    await syncConversation();
  }

  async function submitMessage() {
    if (
      !message.trim() ||
      sending
    ) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const {
        messageId,
        providers,
      } = await sendHumanMessage(
        conversationId,
        message,
        replyTo?.id ?? null
      );

      setMessage("");
      onCancelReply();

      await syncConversation();

      await generateProviders(
        providers,
        messageId
      );

      await syncConversation();
    } catch (submitError) {
      console.error(
        submitError
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