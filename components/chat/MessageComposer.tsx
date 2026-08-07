"use client";

import { useState } from "react";
import { sendMessage } from "@/app/actions";

type Props = {
  conversationId: number;
};

export function MessageComposer({ conversationId }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!message.trim() || sending) return;

    setSending(true);

    await sendMessage(conversationId, message);

    setMessage("");
    setSending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="border-t pt-4">
      <div className="flex gap-3">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-md border bg-background px-4 py-2 outline-none focus:ring-2 focus:ring-ring"
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