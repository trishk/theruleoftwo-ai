"use client";

import { useEffect, useRef } from "react";

import { MentionPicker } from "./MentionPicker";
import { ReplyPreview } from "./ReplyPreview";

import type { ChatReply } from "../conversation/types";
import type { Provider } from "@/lib/llm/types";

type Props = {
  message: string;
  sending: boolean;
  error: string | null;
  replyTo: ChatReply | null;
  configuredProviders: Provider[];

  onMessageChange: (message: string) => void;
  onCancelReply: () => void;
  onSubmit: () => Promise<void>;
  onStopGeneration: () => void;
};

export function MessageComposer({
  message,
  sending,
  error,
  replyTo,
  configuredProviders,
  onMessageChange,
  onCancelReply,
  onSubmit,
  onStopGeneration,
}: Props) {
  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );
  const wasSendingRef =
    useRef(sending);

  useEffect(() => {
    const textarea =
      textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height =
      "auto";

    textarea.style.height =
      `${Math.min(
        textarea.scrollHeight,
        160
      )}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > 160
        ? "auto"
        : "hidden";
  }, [message]);

  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  useEffect(() => {
    if (
      wasSendingRef.current &&
      !sending
    ) {
      textareaRef.current?.focus();
    }

    wasSendingRef.current = sending;
  }, [sending]);

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    await onSubmit();
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();

      event.currentTarget.form
        ?.requestSubmit();
    }
  }

  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 pb-6 pt-4 sm:px-6">
        <form
          onSubmit={handleSubmit}
        >
          {error && (
            <div
              role="alert"
              className="mb-2 text-sm text-red-500"
            >
              {error}
            </div>
          )}

          <MentionPicker
            message={message}
            configuredProviders={
              configuredProviders
            }
            disabled={sending}
            onChange={(value) => {
              onMessageChange(value);

              textareaRef.current
                ?.focus();
            }}
          />

          <div
            data-testid="composer-shell"
            className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm transition-colors focus-within:border-muted-foreground/50"
          >
            {replyTo && (
              <ReplyPreview
                replyTo={replyTo}
                onCancel={
                  onCancelReply
                }
              />
            )}

            <div className="flex min-w-0 items-end gap-2 p-2">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) =>
                  onMessageChange(
                    event.target.value
                  )
                }
                onKeyDown={
                  handleKeyDown
                }
                aria-label="Message"
                placeholder="Ask for another perspective..."
                rows={1}
                disabled={sending}
                className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm"
              />

              <button
                type={
                  sending
                    ? "button"
                    : "submit"
                }
                onClick={
                  sending
                    ? onStopGeneration
                    : undefined
                }
                disabled={
                  !sending &&
                  !message.trim()
                }
                aria-label={
                  sending
                    ? "Stop generation"
                    : "Send message"
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 md:h-10 md:w-10"
              >
                {sending ? (
                  <span
                    className="h-3.5 w-3.5 rounded-sm bg-current"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="text-lg leading-none">
                    ↑
                  </span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
