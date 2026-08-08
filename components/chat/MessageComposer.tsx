"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/app/actions";
import { PROVIDER_LIST } from "@/lib/llm/providerMeta";

type Props = {
  conversationId: number;
};

export function MessageComposer({ conversationId }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [message]);

  function toggleMention(mention: string) {
    setMessage((current) => {
      const escapedMention = mention.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const mentionRegex = new RegExp(`${escapedMention}\\s*`, "gi");

      if (current.toLowerCase().includes(mention.toLowerCase())) {
        return current.replace(mentionRegex, "").trimStart();
      }

      const trimmed = current.trimStart();

      return `${mention} ${trimmed}`.trimEnd() + " ";
    });

    textareaRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!message.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      await sendMessage(conversationId, message);
      setMessage("");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
        <form onSubmit={handleSubmit}>
          {error && (
  <div
    role="alert"
    className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
  >
    {error}
  </div>
)}

          <div className="mb-2 flex flex-wrap gap-2">
            {PROVIDER_LIST.map((provider) => {
              const isSelected = message
                .toLowerCase()
                .includes(provider.mention);

              return (
                <button
                key={provider.mention}
                type="button"
                onClick={() => toggleMention(provider.mention)}
                disabled={sending}
                className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    isSelected
                    ? `border-current bg-muted ${provider.colorClass}`
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                ].join(" ")}
                >
                @{provider.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 p-2 shadow-sm transition-colors focus-within:border-muted-foreground/50">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for another perspective..."
              rows={1}
              disabled={sending}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!message.trim() || sending}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {sending ? (
                <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                />
                ) : (
                <span className="text-lg leading-none">↑</span>
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