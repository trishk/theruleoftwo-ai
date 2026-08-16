"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { sendHumanMessage } from "@/app/actions";
import type { LLMStreamEvent } from "@/lib/llm/types";
import { useConversationRealtime } from "./RealtimeConversationSync";
import type {
  ChatMessage,
  ChatReply,
} from "./types";

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
  const [sending, setSending] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  async function submitMessage() {
    if (!message.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const { providers } =
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

            const authorName =
              provider === "openai"
                ? "ChatGPT"
                : provider ===
                    "anthropic"
                  ? "Claude"
                  : "Gemini";

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

            try {
              const response =
                await fetch(
                  "/api/chat/stream",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type":
                        "application/json",
                    },
                    body: JSON.stringify({
                      conversationId,
                      provider,
                    }),
                  }
                );

              if (!response.ok) {
                throw new Error(
                  `Streaming failed for ${provider}.`
                );
              }

              if (!response.body) {
                throw new Error(
                  "Streaming response has no body."
                );
              }

              const reader =
                response.body.getReader();

              const decoder =
                new TextDecoder();

              let streamedText = "";
              let buffer = "";
              let providerFailed = false;

              while (true) {
                const { done, value } =
                  await reader.read();

                if (done) {
                  break;
                }

                buffer += decoder.decode(
                  value,
                  {
                    stream: true,
                  }
                );

                const lines =
                  buffer.split("\n");

                buffer =
                  lines.pop() ?? "";

                for (const line of lines) {
                  if (!line.trim()) {
                    continue;
                  }

                  const event =
                    JSON.parse(
                      line
                    ) as LLMStreamEvent;

                  if (
                    event.type === "delta"
                  ) {
                    streamedText +=
                      event.text;

                    onStreamingMessagesChange(
                      (current) =>
                        current.map(
                          (item) =>
                            item.id ===
                            temporaryId
                              ? {
                                  ...item,
                                  content:
                                    streamedText,
                                }
                              : item
                        )
                    );
                  }

                  if (
                    event.type === "error"
                  ) {
                    providerFailed = true;

                    const errorMessage =
                      event.code ===
                      "insufficient_credits"
                        ? `${authorName} has no remaining credits.`
                        : event.code ===
                            "rate_limit"
                          ? `${authorName} rate limit reached. Please try again shortly.`
                          : event.code ===
                              "invalid_api_key"
                            ? `${authorName} API key is invalid or unauthorized.`
                            : `${authorName} failed to respond. Please try again.`;

                    onStreamingMessagesChange(
                      (current) =>
                        current.map(
                          (item) =>
                            item.id ===
                            temporaryId
                              ? {
                                  ...item,
                                  content:
                                    errorMessage,
                                  isStreaming:
                                    false,
                                }
                              : item
                        )
                    );
                  }
                }
              }

              if (!providerFailed) {
                onStreamingMessagesChange(
                  (current) =>
                    current.map(
                      (item) =>
                        item.id ===
                        temporaryId
                          ? {
                              ...item,
                              isStreaming:
                                false,
                            }
                          : item
                    )
                );
              }
            } catch (providerError) {
              console.error(
                `Provider ${provider} failed:`,
                providerError
              );

              onStreamingMessagesChange(
                (current) =>
                  current.map(
                    (item) =>
                      item.id ===
                      temporaryId
                        ? {
                            ...item,
                            content:
                              `${authorName} failed to respond. Please try again.`,
                            isStreaming:
                              false,
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