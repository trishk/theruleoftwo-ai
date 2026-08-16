"use client";

import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";
import type { ChatMessage } from "./types";

type Props = {
  messages: ChatMessage[];
  onReply: (message: ChatMessage) => void;
};

export function MessageList({
  messages,
  onReply,
}: Props) {
  const scrollContainerRef =
    useRef<HTMLDivElement | null>(null);

  const shouldAutoScrollRef =
    useRef(true);

  useEffect(() => {
    const container =
      scrollContainerRef.current;

    if (
      !container ||
      !shouldAutoScrollRef.current
    ) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        No messages yet.
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
          <MessageItem
            key={message.id}
            authorType={message.authorType}
            authorName={message.authorName}
            content={message.content}
            createdAt={message.createdAt}
            isOwnMessage={
              message.isOwnMessage
            }
            replyTo={message.replyTo}
            onReply={() =>
              onReply(message)
            }
          />
        ))}
      </div>
    </div>
  );
}