import {
  Copy,
  Reply,
  RotateCcw,
} from "lucide-react";
import {
  useEffect,
  useRef,
} from "react";

import { ProviderIcon } from "@/components/brand/ProviderIcon";
import {
  isKnownProvider,
  type ParticipantIdentity,
} from "@/lib/chat/participant-identity";

import type { ChatReply } from "./types";

type Props = {
  messageId: number;
  authorType: "human" | "ai";
  authorName: string;
  participant?: ParticipantIdentity;
  provider?: string;
  content: string;
  createdAt: Date;
  isOwnMessage: boolean;
  isError?: boolean;
  isStreaming?: boolean;
  replyTo?: ChatReply | null;
  actionsOpen?: boolean;
  onOpenActions?: (
    trigger: HTMLElement
  ) => void;
  onCloseActions?: (
    restoreFocus?: boolean
  ) => void;
  onCopy?: () => void;
  onReply?: () => void;
  onRetry?: () => void;
};

function formatMessageTime(createdAt: Date): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageItem({
  messageId,
  authorType,
  authorName,
  participant,
  provider: providerId,
  content,
  createdAt,
  isOwnMessage,
  isError = false,
  isStreaming = false,
  replyTo,
  actionsOpen = false,
  onOpenActions,
  onCloseActions,
  onCopy,
  onReply,
  onRetry,
}: Props) {
  const longPressTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(
    null
  );
  const longPressOpenedRef = useRef(false);

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }

  useEffect(() => cancelLongPress, []);

  useEffect(() => {
    if (actionsOpen) {
      menuRef.current
        ?.querySelector<HTMLElement>(
          '[role="menuitem"]'
        )
        ?.focus({ preventScroll: true });
    }
  }, [actionsOpen]);

  function handlePointerDown(
    event: React.PointerEvent<HTMLElement>
  ) {
    if (
      event.pointerType !== "touch" ||
      !onOpenActions
    ) {
      return;
    }
    cancelLongPress();
    longPressOpenedRef.current = false;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    const trigger = event.currentTarget;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      pointerStartRef.current = null;
      longPressOpenedRef.current = true;
      onOpenActions(trigger);
    }, 500);
  }

  function handlePointerMove(
    event: React.PointerEvent<HTMLElement>
  ) {
    const start = pointerStartRef.current;
    if (
      !start ||
      Math.hypot(
        event.clientX - start.x,
        event.clientY - start.y
      ) <= 10
    ) {
      return;
    }
    cancelLongPress();
  }

  function handleContextMenu(
    event: React.MouseEvent<HTMLElement>
  ) {
    if (longPressOpenedRef.current) {
      event.preventDefault();
      longPressOpenedRef.current = false;
    }
  }

  const pointerProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: cancelLongPress,
    onPointerCancel: cancelLongPress,
    onContextMenu: handleContextMenu,
  };

  const actionMenu = actionsOpen ? (
    <div
      ref={menuRef}
      role="menu"
      data-message-actions="true"
      aria-label={`Message actions for ${authorName}`}
      className="absolute right-0 top-full z-20 mt-1 min-w-32 overflow-hidden rounded-xl border border-border bg-background p-1 shadow-lg"
    >
      {onReply && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCloseActions?.(false);
            onReply();
          }}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted focus:bg-muted focus:outline-none"
        >
          <Reply className="h-4 w-4" />
          Reply
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={onCopy}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-muted focus:bg-muted focus:outline-none"
      >
        <Copy className="h-4 w-4" />
        Copy
      </button>
    </div>
  ) : null;
  const provider =
    providerId && isKnownProvider(providerId)
      ? providerId
      : undefined;
  const displayName =
    participant?.displayName ?? authorName;

  const isHuman =
    authorType === "human";

  const messageTimeIso =
    createdAt instanceof Date && !isNaN(createdAt.getTime())
      ? createdAt.toISOString()
      : undefined;
  const formattedTime = formatMessageTime(createdAt);

  if (isHuman) {
    return (
      <div
        data-testid={`message-${messageId}`}
        tabIndex={-1}
        {...pointerProps}
        className={[
          "group relative flex touch-pan-y py-3 [@media(pointer:coarse)]:select-none",
          isOwnMessage
            ? "justify-end"
            : "justify-start",
        ].join(" ")}
      >
        <div
          className={[
            "flex max-w-[78%] items-start gap-2",
            isOwnMessage
              ? "flex-row"
              : "flex-row-reverse",
          ].join(" ")}
        >
          {onReply && (
            <button
              data-desktop-reply="true"
              type="button"
              onClick={onReply}
              aria-label={`Reply to ${authorName}`}
              title={`Reply to ${authorName}`}
              className="sr-only mt-1 shrink-0 rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground [@media(pointer:fine)]:not-sr-only [@media(pointer:fine)]:flex [@media(pointer:fine)]:h-8 [@media(pointer:fine)]:w-8 [@media(pointer:fine)]:items-center [@media(pointer:fine)]:justify-center [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:focus:opacity-100"
            >
              <Reply className="h-4 w-4" />
            </button>
          )}

          <div
            className={[
              "min-w-0",
              isOwnMessage
                ? "text-right"
                : "text-left",
            ].join(" ")}
          >
            <div
              className={[
                "mb-1.5 flex items-baseline gap-2 text-sm",
                isOwnMessage
                  ? "justify-end"
                  : "justify-start",
              ].join(" ")}
            >
              {isOwnMessage ? (
                <>
                  {formattedTime && (
                    <time
                      dateTime={messageTimeIso}
                      suppressHydrationWarning
                      className="text-xs text-muted-foreground"
                    >
                      {formattedTime}
                    </time>
                  )}
                  <span className="font-semibold text-foreground">
                    {authorName}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">
                    {authorName}
                  </span>
                  {formattedTime && (
                    <time
                      dateTime={messageTimeIso}
                      suppressHydrationWarning
                      className="text-xs text-muted-foreground"
                    >
                      {formattedTime}
                    </time>
                  )}
                </>
              )}
            </div>

            <div
              className={[
                "rounded-2xl border px-4 py-3 text-left",
                isOwnMessage
                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                  : "border-border bg-background text-foreground",
              ].join(" ")}
            >
              {replyTo && (
                <div
                  className={[
                    "mb-2 rounded-md py-2 text-xs",
                    isOwnMessage
                      ? "border-r-2 border-white/40 bg-white/10 pl-2 pr-3 text-white/80"
                      : "border-l-2 border-border bg-muted/40 pl-3 pr-2 text-muted-foreground",
                  ].join(" ")}
                >
                  <div className="font-medium">
                    {replyTo.authorName}
                  </div>

                  <div className="truncate">
                    {replyTo.content}
                  </div>
                </div>
              )}

              <div
                className={[
                  "whitespace-pre-wrap text-left text-sm leading-relaxed",
                  isOwnMessage
                    ? "text-white"
                    : "text-foreground",
                ].join(" ")}
              >
                {content}
              </div>
            </div>
          </div>
        </div>
        {actionMenu}
      </div>
    );
  }

  return (
    <div
      data-testid={`message-${messageId}`}
      tabIndex={-1}
      {...pointerProps}
      className="group relative flex touch-pan-y gap-3 py-3 [@media(pointer:coarse)]:select-none"
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
        {provider ? (
          <ProviderIcon
            provider={provider}
            size={18}
          />
        ) : (
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">
            {displayName}
          </div>

          {formattedTime && (
            <time
              dateTime={messageTimeIso}
              suppressHydrationWarning
              className="text-xs text-muted-foreground"
            >
              {formattedTime}
            </time>
          )}

          {onReply && (
            <button
              data-desktop-reply="true"
              type="button"
              onClick={onReply}
              aria-label={`Reply to ${authorName}`}
              title={`Reply to ${authorName}`}
              className="sr-only rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground [@media(pointer:fine)]:not-sr-only [@media(pointer:fine)]:flex [@media(pointer:fine)]:h-6 [@media(pointer:fine)]:w-6 [@media(pointer:fine)]:items-center [@media(pointer:fine)]:justify-center [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:focus:opacity-100"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}

          {isError &&
            onRetry && (
              <button
                type="button"
                onClick={onRetry}
                aria-label={`Retry ${authorName}`}
                title={`Retry ${authorName}`}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
        </div>

        {replyTo && (
          <div className="mb-2 rounded-md border-l-2 border-border bg-muted/30 py-2 pl-3 pr-2 text-xs text-muted-foreground">
            <div className="font-medium">
              {replyTo.authorName}
            </div>

            <div className="truncate">
              {replyTo.content}
            </div>
          </div>
        )}

        {isStreaming && !content ? (
          <div
            role="status"
            aria-label="Thinking..."
            className="flex items-center gap-2 py-1 text-xs text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
            </span>
            <span>Thinking...</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {content}
          </div>
        )}
      </div>
      {actionMenu}
    </div>
  );
}
