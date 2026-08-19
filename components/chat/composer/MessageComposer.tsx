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
  }, [message]);

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
      !event.shiftKey
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
          {replyTo && (
            <ReplyPreview
              replyTo={replyTo}
              onCancel={
                onCancelReply
              }
            />
          )}

          {error && (
            <div className="mb-2 text-sm text-red-500">
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

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 p-2 shadow-sm transition-colors focus-within:border-muted-foreground/50">
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
              placeholder="Ask for another perspective..."
              rows={1}
              disabled={sending}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
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

          <div className="mt-2 px-1 text-xs text-muted-foreground">
            {sending
              ? "Waiting for selected perspectives..."
              : "Choose one or more perspectives"}
          </div>
        </form>
      </div>
    </div>
  );
}