"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
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
  } = useConversationRealtime();

  const [message, setMessage] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const isActiveRef = useRef(true);
  const pendingSubmissionRef = useRef<{
    clientMessageId: string;
    content: string;
    replyToId: number | null;
  } | null>(null);
  const submissionInFlightRef = useRef(false);

  useEffect(() => {
    isActiveRef.current = true;

    return () => {
      isActiveRef.current = false;
    };
  }, []);

  const {
    generateProviders,
    retryProvider:
      retryProviderGeneration,
    stopGeneration,
  } = useProviderGeneration({
    conversationId,
    onStreamingMessagesChange,
  });

  function syncConversation() {
    try {
      void Promise.resolve(
        broadcastMessageCreated()
      ).catch(() => {
        console.error(
          "Realtime message notification failed."
        );
      });
    } catch {
      console.error(
        "Realtime message notification failed."
      );
    }
  }

  async function retryProvider(
    provider: Parameters<
      typeof retryProviderGeneration
    >[0],
    sourceMessageId: number,
    temporaryMessageId: number,
    retryOfAttemptId?: string
  ) {
    await retryProviderGeneration(
      provider,
      sourceMessageId,
      temporaryMessageId,
      retryOfAttemptId
    );

    if (!isActiveRef.current) {
      return;
    }

    router.refresh();

    syncConversation();
  }

  async function submitMessage() {
    const submittedMessage =
      message.trim();

    if (
      !submittedMessage ||
      sending ||
      submissionInFlightRef.current
    ) {
      return;
    }

    submissionInFlightRef.current = true;

    onSubmitAccepted();

    const temporaryMessageId =
      createTemporaryMessageId();
    const submittedReplyToId = replyTo?.id ?? null;
    const priorSubmission = pendingSubmissionRef.current;
    const clientMessageId =
      priorSubmission?.content === submittedMessage &&
      priorSubmission.replyToId === submittedReplyToId
        ? priorSubmission.clientMessageId
        : crypto.randomUUID();
    pendingSubmissionRef.current = {
      clientMessageId,
      content: submittedMessage,
      replyToId: submittedReplyToId,
    };

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
        outcome,
      } = await sendHumanMessage(
        conversationId,
        submittedMessage,
        submittedReplyToId,
        clientMessageId
      );

      if (isActiveRef.current) {
        onOptimisticMessagesChange(
          (current) =>
            current.map((item) =>
              item.id === temporaryMessageId
                ? {
                    ...item,
                    persistedMessageId: messageId,
                  }
                : item
            )
        );
        syncConversation();
      }

      pendingSubmissionRef.current = null;

      if (outcome !== "duplicate") {
        await generateProviders(providers, messageId);
      }

      if (!isActiveRef.current) {
        return;
      }

      router.refresh();

      syncConversation();
    } catch (submitError) {
      if (!isActiveRef.current) {
        return;
      }

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
      submissionInFlightRef.current = false;
      if (isActiveRef.current) {
        setSending(false);
      }
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
