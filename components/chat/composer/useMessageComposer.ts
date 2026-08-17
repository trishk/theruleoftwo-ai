"use client";

import {
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { sendHumanMessage } from "@/app/actions";
import type { Provider } from "@/lib/llm/types";

import { useConversationRealtime } from "../realtime/RealtimeConversationSync";
import {
  StreamRequestError,
  streamProviderResponse,
} from "./streamProviderResponse";
import {
  getProviderDisplayName,
  getProviderErrorMessage,
} from "./providerDisplay";
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

type RunProviderGenerationArgs = {
  provider: Provider;
  sourceMessageId: number;
  temporaryMessageId: number;
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

  const abortControllersRef = useRef<
    AbortController[]
  >([]);

  function updateStreamingMessage(
    temporaryMessageId: number,
    changes: Partial<ChatMessage>
  ) {
    onStreamingMessagesChange(
      (current) =>
        current.map((item) =>
          item.id === temporaryMessageId
            ? {
                ...item,
                ...changes,
              }
            : item
        )
    );
  }

  function removeStreamingMessage(
    temporaryMessageId: number
  ) {
    onStreamingMessagesChange(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            temporaryMessageId
        )
    );
  }

  async function syncConversation() {
    router.refresh();

    if (isReady) {
      await broadcastMessageCreated();
    }
  }

  function stopGeneration() {
    for (
      const controller of
      abortControllersRef.current
    ) {
      controller.abort();
    }

    abortControllersRef.current = [];
  }

  async function runProviderGeneration({
    provider,
    sourceMessageId,
    temporaryMessageId,
  }: RunProviderGenerationArgs) {
    const controller =
      new AbortController();

    abortControllersRef.current.push(
      controller
    );

    let providerFailed = false;

    try {
      await streamProviderResponse({
        conversationId,
        messageId:
          sourceMessageId,
        provider,
        signal:
          controller.signal,

        onDelta: (
          streamedText
        ) => {
          updateStreamingMessage(
            temporaryMessageId,
            {
              content:
                streamedText,
            }
          );
        },

        onError: (event) => {
          providerFailed = true;

          updateStreamingMessage(
            temporaryMessageId,
            {
              content:
                getProviderErrorMessage(
                  provider,
                  event.code
                ),
              isStreaming: false,
              isError: true,
            }
          );
        },
      });

      if (providerFailed) {
        return;
      }

      removeStreamingMessage(
        temporaryMessageId
      );
    } catch (providerError) {
      const wasAborted =
        providerError instanceof
          DOMException &&
        providerError.name ===
          "AbortError";

      if (wasAborted) {
        removeStreamingMessage(
          temporaryMessageId
        );

        return;
      }

      if (
        providerError instanceof
          StreamRequestError &&
        providerError.status === 429
      ) {
        const retryAfter =
          providerError.retryAfterSeconds;

        const retryMessage =
          retryAfter
            ? `Too many requests. Try again in ${retryAfter}s.`
            : "Too many requests. Please try again shortly.";

        updateStreamingMessage(
          temporaryMessageId,
          {
            content:
              retryMessage,
            isStreaming: false,
            isError: true,
          }
        );

        return;
      }

      console.error(
        `Provider ${provider} failed:`,
        providerError
      );

      const authorName =
        getProviderDisplayName(
          provider
        );

      updateStreamingMessage(
        temporaryMessageId,
        {
          content:
            `${authorName} failed to respond. Please try again.`,
          isStreaming: false,
          isError: true,
        }
      );
    } finally {
      abortControllersRef.current =
        abortControllersRef.current.filter(
          (item) =>
            item !== controller
        );
    }
  }

  async function retryProvider(
    provider: Provider,
    sourceMessageId: number,
    temporaryMessageId: number
  ) {
    updateStreamingMessage(
      temporaryMessageId,
      {
        content: "",
        isStreaming: true,
        isError: false,
      }
    );

    await runProviderGeneration({
      provider,
      sourceMessageId,
      temporaryMessageId,
    });

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

      const generationTasks =
        providers.map(
          (
            provider,
            index
          ) => {
            const temporaryMessageId =
              -Date.now() -
              index -
              Math.floor(
                Math.random() *
                  1000
              );

            const authorName =
              getProviderDisplayName(
                provider
              );

            onStreamingMessagesChange(
              (current) => [
                ...current,
                {
                  id:
                    temporaryMessageId,
                  authorType: "ai",
                  authorName,
                  content: "",
                  createdAt:
                    new Date(),
                  isOwnMessage:
                    false,
                  isStreaming: true,
                  isError: false,
                  provider,
                  sourceMessageId:
                    messageId,
                  replyTo: null,
                },
              ]
            );

            return runProviderGeneration({
              provider,
              sourceMessageId:
                messageId,
              temporaryMessageId,
            });
          }
        );

      await Promise.allSettled(
        generationTasks
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