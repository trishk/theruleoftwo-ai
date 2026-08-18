"use client";

import { useRef } from "react";

import type { Provider } from "@/lib/llm/types";

import {
  StreamRequestError,
  streamProviderResponse,
} from "./streamProviderResponse";

import {
  getProviderDisplayName,
  getProviderErrorMessage,
} from "./providerDisplay";

import type { ChatMessage } from "../conversation/types";

type Props = {
  conversationId: number;
  onStreamingMessagesChange: React.Dispatch<
    React.SetStateAction<ChatMessage[]>
  >;
};

type RunProviderGenerationArgs = {
  provider: Provider;
  sourceMessageId: number;
  temporaryMessageId: number;
};

export function useProviderGeneration({
  conversationId,
  onStreamingMessagesChange,
}: Props) {
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
            item.id !== temporaryMessageId
        )
    );
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
        messageId: sourceMessageId,
        provider,
        signal: controller.signal,

        onDelta: (streamedText) => {
          updateStreamingMessage(
            temporaryMessageId,
            {
              content: streamedText,
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
            content: retryMessage,
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

  function createStreamingMessage(
    provider: Provider,
    sourceMessageId: number,
    index: number
  ) {
    const temporaryMessageId =
      -Date.now() -
      index -
      Math.floor(
        Math.random() * 1000
      );

    const authorName =
      getProviderDisplayName(provider);

    onStreamingMessagesChange(
      (current) => [
        ...current,
        {
          id: temporaryMessageId,
          authorType: "ai",
          authorName,
          content: "",
          createdAt: new Date(),
          isOwnMessage: false,
          isStreaming: true,
          isError: false,
          provider,
          sourceMessageId,
          replyTo: null,
        },
      ]
    );

    return temporaryMessageId;
  }

  async function generateProviders(
    providers: Provider[],
    sourceMessageId: number
  ) {
    const generationTasks =
      providers.map(
        (provider, index) => {
          const temporaryMessageId =
            createStreamingMessage(
              provider,
              sourceMessageId,
              index
            );

          return runProviderGeneration({
            provider,
            sourceMessageId,
            temporaryMessageId,
          });
        }
      );

    await Promise.allSettled(
      generationTasks
    );
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
  }

  return {
    generateProviders,
    retryProvider,
    stopGeneration,
  };
}