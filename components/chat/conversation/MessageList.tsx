"use client";

import {
  memo,
  useEffect,
  useRef,
} from "react";

import { RuleOfTwoMark } from "@/components/brand/RuleOfTwoMark";

import { MessageItem } from "./MessageItem";
import type { ChatMessage } from "./types";

type Props = {
  messages: ChatMessage[];
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
};

type MessageRowProps = {
  message: ChatMessage;
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
};

const MessageRow = memo(
  function MessageRow({
    message,
    onReply,
    onRetry,
  }: MessageRowProps) {
    return (
      <MessageItem
        authorType={message.authorType}
        authorName={message.authorName}
        content={message.content}
        createdAt={message.createdAt}
        isOwnMessage={message.isOwnMessage}
        isError={message.isError}
        replyTo={message.replyTo}
        onReply={
          message.id > 0
            ? () =>
                onReply(message)
            : undefined
        }
        onRetry={
          message.isRetryable === false
            ? undefined
            : () => onRetry(message)
        }
      />
    );
  }
);

export function MessageList({
  messages,
  onReply,
  onRetry,
}: Props) {
  const scrollContainerRef =
    useRef<HTMLDivElement | null>(null);

  const shouldAutoScrollRef =
    useRef(true);

  const scrollFrameRef = useRef<
    number | null
  >(null);

  useEffect(() => {
    const container =
      scrollContainerRef.current;

    if (
      !container ||
      !shouldAutoScrollRef.current
    ) {
      return;
    }

    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current =
      requestAnimationFrame(() => {
        scrollFrameRef.current = null;

        container.scrollTo({
          top: container.scrollHeight,
          behavior: messages.some(
            (message) =>
              message.isStreaming
          )
            ? "auto"
            : "smooth",
        });
      });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(
          scrollFrameRef.current
        );
      }
    };
  }, []);

  function handleScroll() {
    const container =
      scrollContainerRef.current;

    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    shouldAutoScrollRef.current =
      distanceFromBottom < 120;
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="flex flex-col items-center text-center">
          <RuleOfTwoMark className="mb-5 h-8 opacity-80" />

          <p className="text-base font-medium text-foreground">
            Bring in another perspective.
          </p>

          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Mention one or more AI participants to start.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onReply={onReply}
            onRetry={onRetry}
          />
        ))}
      </div>
    </div>
  );
}
