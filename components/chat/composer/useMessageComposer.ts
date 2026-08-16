"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getProviderDisplayName,
  getProviderErrorMessage,
} from "./providerDisplay";
import { sendHumanMessage } from "@/app/actions";
import { useConversationRealtime } from "../realtime/RealtimeConversationSync";
import {
  StreamRequestError,
  streamProviderResponse
} from "./streamProviderResponse";
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

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const abortControllersRef = useRef<
    AbortController[]
  >([]);

  function stopGeneration() {
    for (const controller of abortControllersRef.current) {
      controller.abort();
    }

    abortControllersRef.current = [];
  }

  async function submitMessage() {
    if (!message.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const { 
        messageId, 
        providers } =
        await sendHumanMessage(
          conversationId,
          message,
          replyTo?.id ?? null
        );

      setMessage("");
      onCancelReply();

      router.refresh();

      if (isReady) {
        await broadcastMessageCreated();
      }

      await Promise.allSettled(
        providers.map(
          async (provider, index) => {
            const temporaryId =
              -Date.now() -
              index -
              Math.floor(
                Math.random() * 1000
              );

            const authorName = getProviderDisplayName(provider);

            const removeTemporaryMessage = () => {
              onStreamingMessagesChange(
                (current) =>
                  current.filter(
                    (item) =>
                      item.id !== temporaryId
                  )
              );
            };

            onStreamingMessagesChange(
              (current) => [
                ...current,
                {
                  id: temporaryId,
                  authorType: "ai",
                  authorName,
                  content: "",
                  createdAt: new Date(),
                  isOwnMessage: false,
                  isStreaming: true,
                  replyTo: null,
                },
              ]
            );

            const controller =
              new AbortController();

            abortControllersRef.current.push(
              controller
            );

            try {
              let providerFailed = false;

              await streamProviderResponse({
                conversationId,
                messageId,
                provider,
                signal: controller.signal,

                onDelta: (streamedText) => {
                  onStreamingMessagesChange(
                    (current) =>
                      current.map((item) =>
                        item.id === temporaryId
                          ? {
                            ...item,
                            content: streamedText,
                          }
                          : item
                      )
                  );
                },

                onError: (event) => {
                  providerFailed = true;

                  const errorMessage =
                    getProviderErrorMessage(
                      provider,
                      event.code
                    );

                  onStreamingMessagesChange(
                    (current) =>
                      current.map((item) =>
                        item.id === temporaryId
                          ? {
                            ...item,
                            content: errorMessage,
                            isStreaming: false,
                          }
                          : item
                      )
                  );
                },
              });

              if (!providerFailed) {
                removeTemporaryMessage();
              }
            } catch (providerError) {
              const wasAborted =
                providerError instanceof
                DOMException &&
                providerError.name ===
                "AbortError";

              if (wasAborted) {
                removeTemporaryMessage();
                return;
              }

              if (
                providerError instanceof
                StreamRequestError &&
                providerError.status === 429
              ) {
                const retryAfter =
                  providerError.retryAfterSeconds ?? 60;

                onStreamingMessagesChange(
                  (current) =>
                    current.map((item) =>
                      item.id === temporaryId
                        ? {
                          ...item,
                          content:
                            `Too many requests. Try again in ${retryAfter}s.`,
                          isStreaming: false,
                        }
                        : item
                    )
                );

                return;
              }

              console.error(
                `Provider ${provider} failed:`,
                providerError
              );

              onStreamingMessagesChange(
                (current) =>
                  current.map((item) =>
                    item.id === temporaryId
                      ? {
                        ...item,
                        content:
                          `${authorName} failed to respond. Please try again.`,
                        isStreaming: false,
                      }
                      : item
                  )
              );
            }
          }
        )
      );

      router.refresh();

      if (isReady) {
        await broadcastMessageCreated();
      }
    } catch (err) {
      console.error(err);

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      abortControllersRef.current = [];
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
  };
}