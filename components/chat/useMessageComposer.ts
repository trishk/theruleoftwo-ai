"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { sendMessage } from "@/app/actions";
import { useConversationRealtime } from "./RealtimeConversationSync";
import type { ChatReply } from "./types";

type Props = {
  conversationId: number;
  replyTo: ChatReply | null;
  onCancelReply: () => void;
};

export function useMessageComposer({
  conversationId,
  replyTo,
  onCancelReply,
}: Props) {
  const router = useRouter();

  const {
    broadcastMessageCreated,
    isReady,
  } = useConversationRealtime();

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitMessage() {
    if (!message.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      await sendMessage(
        conversationId,
        message,
        replyTo?.id ?? null
      );

      if (isReady) {
        await broadcastMessageCreated();
      }

      setMessage("");
      onCancelReply();
      router.refresh();
    } catch (err) {
      console.error(err);

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
  };
}