"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { RuleOfTwoMark } from "@/components/brand/RuleOfTwoMark";

import { MessageItem } from "./MessageItem";
import type { ChatMessage } from "./types";

type Props = {
  messages: ChatMessage[];
  conversationId?: number;
  followBottomSignal?: number;
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
};

type MessageRowProps = {
  message: ChatMessage;
  actionsOpen: boolean;
  onOpenActions: (
    message: ChatMessage,
    trigger: HTMLElement
  ) => void;
  onCloseActions: (restoreFocus?: boolean) => void;
  onCopy: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
};

const MessageRow = memo(
  function MessageRow({
    message,
    actionsOpen,
    onOpenActions,
    onCloseActions,
    onCopy,
    onReply,
    onRetry,
  }: MessageRowProps) {
    return (
      <MessageItem
        messageId={message.id}
        authorType={message.authorType}
        authorName={message.authorName}
        participant={message.participant}
        provider={message.provider}
        content={message.content}
        createdAt={message.createdAt}
        isOwnMessage={message.isOwnMessage}
        isError={message.isError}
        isStreaming={message.isStreaming}
        replyTo={message.replyTo}
        actionsOpen={actionsOpen}
        onOpenActions={(trigger) =>
          onOpenActions(message, trigger)
        }
        onCloseActions={onCloseActions}
        onCopy={() => onCopy(message)}
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
  conversationId,
  followBottomSignal = 0,
  onReply,
  onRetry,
}: Props) {
  const [openActionsState, setOpenActionsState] =
    useState<{
      conversationId: number | undefined;
      messageId: number;
    } | null>(null);
  const openMessageId =
    openActionsState &&
    openActionsState.conversationId ===
      conversationId
      ? openActionsState.messageId
      : null;
  const [copyStatus, setCopyStatus] =
    useState("");
  const actionTriggerRef =
    useRef<HTMLElement | null>(null);
  const scrollContainerRef =
    useRef<HTMLDivElement | null>(null);

  const shouldAutoScrollRef =
    useRef(true);

  const lastScrollTopRef = useRef(0);

  const lastFollowBottomSignalRef =
    useRef(followBottomSignal);

  const lastConversationIdRef =
    useRef<number | undefined>(undefined);

  const skipNextMessageScrollRef =
    useRef(false);

  const scrollFrameRef = useRef<
    number | null
  >(null);

  const closeActions = useCallback(
    (restoreFocus = true) => {
      setOpenActionsState(null);
      if (restoreFocus) {
        actionTriggerRef.current?.focus({
          preventScroll: true,
        });
      }
      actionTriggerRef.current = null;
    },
    []
  );

  const openActions = useCallback(
    (
      message: ChatMessage,
      trigger: HTMLElement
    ) => {
      actionTriggerRef.current = trigger;
      setOpenActionsState({
        conversationId,
        messageId: message.id,
      });
      setCopyStatus("");
    },
    [conversationId]
  );

  const copyMessage = useCallback(
    async (message: ChatMessage) => {
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(
              message.content
            );
            copied = true;
          } catch {
            // Continue to the local selection fallback.
          }
        }

        if (!copied) {
          const textarea =
            document.createElement("textarea");
          textarea.value = message.content;
          textarea.setAttribute(
            "readonly",
            ""
          );
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          try {
            textarea.select();
            copied = document.execCommand("copy");
          } finally {
            textarea.remove();
          }
        }
        setCopyStatus(
          copied
            ? "Message copied"
            : "Message could not be copied"
        );
      } catch {
        setCopyStatus(
          "Message could not be copied"
        );
      } finally {
        closeActions(false);
      }
    },
    [closeActions]
  );

  useEffect(() => {
    if (openMessageId === null) {
      return;
    }

    function handleOutsidePointer(
      event: PointerEvent
    ) {
      const target = event.target;
      if (
        target instanceof Node &&
        !document
          .querySelector(
            '[role="menu"][data-message-actions="true"]'
          )
          ?.contains(target)
      ) {
        closeActions();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActions();
      }
    }

    document.addEventListener(
      "pointerdown",
      handleOutsidePointer
    );
    document.addEventListener(
      "keydown",
      handleKeyDown
    );
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointer
      );
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [closeActions, openMessageId]);

  useLayoutEffect(() => {
    if (
      lastConversationIdRef.current ===
      conversationId
    ) {
      return;
    }

    lastConversationIdRef.current =
      conversationId;
    shouldAutoScrollRef.current = true;
    skipNextMessageScrollRef.current = true;

    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(
        scrollFrameRef.current
      );
      scrollFrameRef.current = null;
    }

    const container =
      scrollContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto",
    });
    lastScrollTopRef.current =
      container.scrollTop;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (
      lastFollowBottomSignalRef.current ===
      followBottomSignal
    ) {
      return;
    }

    lastFollowBottomSignalRef.current =
      followBottomSignal;
    shouldAutoScrollRef.current = true;
    skipNextMessageScrollRef.current = true;

    const container =
      scrollContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto",
    });
    lastScrollTopRef.current =
      container.scrollTop;
  }, [followBottomSignal]);

  useEffect(() => {
    const container =
      scrollContainerRef.current;

    if (skipNextMessageScrollRef.current) {
      skipNextMessageScrollRef.current = false;
      return;
    }

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

        lastScrollTopRef.current =
          container.scrollTop;
      });
  }, [followBottomSignal, messages]);

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

    const movedUp =
      container.scrollTop <
      lastScrollTopRef.current;

    lastScrollTopRef.current =
      container.scrollTop;

    if (distanceFromBottom < 120) {
      shouldAutoScrollRef.current = true;
    } else if (movedUp) {
      shouldAutoScrollRef.current = false;
    }
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
            actionsOpen={
              openMessageId === message.id
            }
            onOpenActions={openActions}
            onCloseActions={closeActions}
            onCopy={copyMessage}
            onReply={onReply}
            onRetry={onRetry}
          />
        ))}
      </div>
      <span
        className="sr-only"
        aria-live="polite"
      >
        {copyStatus}
      </span>
    </div>
  );
}
