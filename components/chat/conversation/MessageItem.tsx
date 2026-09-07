import {
  Copy,
  Reply,
  RotateCcw,
} from "lucide-react";
import Image, {
  type ImageLoaderProps,
} from "next/image";
import {
  useEffect,
  useRef,
} from "react";

import { ProviderIcon } from "@/components/brand/ProviderIcon";
import {
  createAiParticipantIdentity,
  getParticipantInitials,
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

function getSafeAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return null;
  }

  if (avatarUrl.startsWith("/") && !avatarUrl.startsWith("//")) {
    return avatarUrl;
  }

  try {
    const url = new URL(avatarUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? avatarUrl
      : null;
  } catch {
    return null;
  }
}

function avatarImageLoader({ src }: ImageLoaderProps) {
  return src;
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

  const aiIdentity =
    authorType === "ai"
      ? createAiParticipantIdentity(
          providerId ??
            (participant?.type === "ai"
              ? participant.providerId
              : "")
        )
      : null;
  const displayName = aiIdentity
    ? aiIdentity.displayName
    : participant?.type === "human"
      ? participant.displayName
      : authorName;

  const actionMenu = actionsOpen ? (
    <div
      ref={menuRef}
      role="menu"
      data-message-actions="true"
      aria-label={`Message actions for ${displayName}`}
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
  const initials = aiIdentity
    ? aiIdentity.initials
    : participant?.type === "human"
      ? participant.initials
      : getParticipantInitials(displayName);
  const avatarUrl =
    participant?.type === "human"
      ? getSafeAvatarUrl(participant.avatarUrl)
      : null;
  const provider =
    aiIdentity && isKnownProvider(aiIdentity.providerId)
      ? aiIdentity.providerId
      : undefined;
  const isCurrentUser =
    authorType === "human" &&
    (isOwnMessage ||
      (participant?.type === "human" &&
        participant.isCurrentUser));

  const messageTimeIso =
    createdAt instanceof Date && !isNaN(createdAt.getTime())
      ? createdAt.toISOString()
      : undefined;
  const formattedTime = formatMessageTime(createdAt);

  return (
    <article
      data-testid={`message-${messageId}`}
      data-current-user={isCurrentUser ? "true" : "false"}
      tabIndex={-1}
      {...pointerProps}
      className={[
        "group relative flex min-w-0 touch-pan-y items-start gap-3 rounded-lg px-2 py-2.5 text-left [@media(pointer:coarse)]:select-none sm:px-3",
        isCurrentUser
          ? "ml-auto w-fit max-w-[85%] bg-muted/20"
          : "w-full",
      ].join(" ")}
    >
      <div
        data-message-part="identity"
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/50 text-[11px] font-semibold text-muted-foreground"
      >
        {provider ? (
          <ProviderIcon
            provider={provider}
            size={18}
            decorative
          />
        ) : avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            loader={avatarImageLoader}
            unoptimized
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            data-message-part="name"
            className="text-sm font-semibold text-foreground"
          >
            {displayName}
          </span>

          {isCurrentUser && displayName !== "You" && (
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
              You
            </span>
          )}

          {formattedTime && (
            <time
              data-message-part="timestamp"
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
              aria-label={`Reply to ${displayName}`}
              title={`Reply to ${displayName}`}
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
                aria-label={`Retry ${displayName}`}
                title={`Retry ${displayName}`}
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
            data-message-part="status"
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
          <div
            data-message-part="body"
            className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap text-sm leading-relaxed text-foreground"
          >
            {content}
          </div>
        )}
      </div>
      {actionMenu}
    </article>
  );
}
