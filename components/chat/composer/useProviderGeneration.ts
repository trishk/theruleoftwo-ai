"use client";

import {
  useEffect,
  useRef,
} from "react";

import type { Provider } from "@/lib/llm/types";
import { createAiParticipantIdentity } from "@/lib/chat/participant-identity";

import {
  StreamRequestError,
  streamProviderResponse,
} from "./streamProviderResponse";
import { createTemporaryMessageId } from "./createTemporaryMessageId";

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

  const pendingContentRef = useRef<
    Map<number, string>
  >(new Map());

  const generatedContentRef = useRef<
    Map<number, string>
  >(new Map());

  const publicationFrameRef = useRef<
    number | null
  >(null);

  function flushPendingContent() {
    publicationFrameRef.current = null;

    const pendingContent =
      pendingContentRef.current;

    if (pendingContent.size === 0) {
      return;
    }

    const contentByMessage = new Map(
      pendingContent
    );

    pendingContent.clear();

    onStreamingMessagesChange(
      (current) =>
        current.map((item) => {
          const content =
            contentByMessage.get(
              item.id
            );

          return content === undefined
            ? item
            : {
                ...item,
                content,
              };
        })
    );
  }

  function scheduleContentPublication(
    temporaryMessageId: number,
    content: string
  ) {
    pendingContentRef.current.set(
      temporaryMessageId,
      content
    );

    if (
      publicationFrameRef.current !==
      null
    ) {
      return;
    }

    publicationFrameRef.current =
      requestAnimationFrame(
        flushPendingContent
      );
  }

  function takePendingContent(
    temporaryMessageId: number
  ) {
    const content =
      pendingContentRef.current.get(
        temporaryMessageId
      );

    pendingContentRef.current.delete(
      temporaryMessageId
    );

    if (
      pendingContentRef.current.size === 0 &&
      publicationFrameRef.current !== null
    ) {
      cancelAnimationFrame(
        publicationFrameRef.current
      );

      publicationFrameRef.current = null;
    }

    return content;
  }

  function discardPendingContent(
    temporaryMessageId: number
  ) {
    takePendingContent(
      temporaryMessageId
    );
  }

  useEffect(() => {
    const pendingContent =
      pendingContentRef.current;
    const generatedContent =
      generatedContentRef.current;

    return () => {
      for (
        const controller of
        abortControllersRef.current
      ) {
        controller.abort();
      }

      abortControllersRef.current = [];

      if (
        publicationFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          publicationFrameRef.current
        );
      }

      pendingContent.clear();
      generatedContent.clear();
    };
  }, []);

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
          generatedContentRef.current.set(
            temporaryMessageId,
            streamedText
          );

          scheduleContentPublication(
            temporaryMessageId,
            streamedText
          );
        },

        onError: (event) => {
          providerFailed = true;

          discardPendingContent(
            temporaryMessageId
          );

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

      const finalContent =
        takePendingContent(
          temporaryMessageId
        );

      updateStreamingMessage(
        temporaryMessageId,
        {
          ...(finalContent === undefined
            ? {}
            : {
                content: finalContent,
              }),
          isStreaming: false,
        }
      );
    } catch (providerError) {
      const wasAborted =
        providerError instanceof
          DOMException &&
        providerError.name ===
          "AbortError";

      if (wasAborted) {
        const partialContent =
          generatedContentRef.current.get(
            temporaryMessageId
          );

        discardPendingContent(temporaryMessageId);

        if (partialContent?.trim()) {
          updateStreamingMessage(
            temporaryMessageId,
            {
              content: partialContent,
              isStreaming: false,
              isStopped: true,
            }
          );
        } else {
          removeStreamingMessage(
            temporaryMessageId
          );
        }

        return;
      }

      if (
        providerError instanceof
          StreamRequestError &&
        providerError.code ===
          "provider_not_configured"
      ) {
        discardPendingContent(
          temporaryMessageId
        );

        updateStreamingMessage(
          temporaryMessageId,
          {
            content: `${getProviderDisplayName(provider)} is not connected. Configure it in Settings → Integrations.`,
            isStreaming: false,
            isError: true,
            isRetryable: false,
          }
        );

        return;
      }

      if (
        providerError instanceof
          StreamRequestError &&
        providerError.status === 429
      ) {
        discardPendingContent(
          temporaryMessageId
        );

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

      discardPendingContent(
        temporaryMessageId
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
      generatedContentRef.current.delete(
        temporaryMessageId
      );

      abortControllersRef.current =
        abortControllersRef.current.filter(
          (item) =>
            item !== controller
        );
    }
  }

  function createStreamingMessage(
    provider: Provider,
    sourceMessageId: number
  ) {
    const temporaryMessageId =
      createTemporaryMessageId();

    const authorName =
      getProviderDisplayName(provider);
    const participant =
      createAiParticipantIdentity(provider);

    onStreamingMessagesChange(
      (current) => [
        ...current,
        {
          id: temporaryMessageId,
          authorType: "ai",
          authorName,
          participant,
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
        (provider) => {
          const temporaryMessageId =
            createStreamingMessage(
              provider,
              sourceMessageId
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
    discardPendingContent(
      temporaryMessageId
    );

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
