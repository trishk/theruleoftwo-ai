import {
  Reply,
  RotateCcw,
} from "lucide-react";

import { ProviderIcon } from "@/components/brand/ProviderIcon";
import { PROVIDER_LIST } from "@/lib/llm/providerMeta";

import type { ChatReply } from "./types";

type Props = {
  authorType: "human" | "ai";
  authorName: string;
  content: string;
  createdAt: Date;
  isOwnMessage: boolean;
  isError?: boolean;
  isStreaming?: boolean;
  replyTo?: ChatReply | null;
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
  authorType,
  authorName,
  content,
  createdAt,
  isOwnMessage,
  isError = false,
  isStreaming = false,
  replyTo,
  onReply,
  onRetry,
}: Props) {
  const provider =
    PROVIDER_LIST.find(
      (item) =>
        item.id.toLowerCase() ===
          authorName.toLowerCase() ||
        item.name.toLowerCase() ===
          authorName.toLowerCase()
    );

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
        className={[
          "group flex py-3",
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
              type="button"
              onClick={onReply}
              aria-label={`Reply to ${authorName}`}
              title={`Reply to ${authorName}`}
              className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-all hover:bg-muted hover:text-foreground md:h-8 md:w-8 md:opacity-0 md:group-hover:opacity-100"
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
      </div>
    );
  }

  return (
    <div className="group flex gap-3 py-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
        {provider ? (
          <ProviderIcon
            provider={provider.id}
            size={18}
          />
        ) : (
          <div className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">
            {provider?.name ?? authorName}
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
              type="button"
              onClick={onReply}
              aria-label={`Reply to ${authorName}`}
              title={`Reply to ${authorName}`}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-all hover:bg-muted hover:text-foreground md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100"
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
    </div>
  );
}
