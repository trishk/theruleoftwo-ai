"use client";

import { useState } from "react";
import { sendMessage } from "@/app/actions";

type Props = {
  conversationId: number;
};

export function MessageComposer({ conversationId }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!message.trim() || sending) return;

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
    <form onSubmit={handleSubmit} className="border-t pt-4">
      {error && (
        <p className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-end gap-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={sending}
          className="min-h-10 flex-1 resize-none rounded-md border bg-background px-4 py-2 outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!message.trim() || sending}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}