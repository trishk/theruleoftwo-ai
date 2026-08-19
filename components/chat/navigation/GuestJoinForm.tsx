"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { joinConversationAsGuest } from "@/app/actions";
import { useConversationRealtime } from "../realtime/RealtimeConversationSync";

type Props = {
  token: string;
};

export function GuestJoinForm({
  token,
}: Props) {
  const router = useRouter();

  const [displayName, setDisplayName] =
    useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [isPending, startTransition] =
    useTransition();

  const {
    broadcastConversationUpdated,
    isReady,
  } = useConversationRealtime();

  function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    startTransition(async () => {
      try {
        setError(null);

        const result =
          await joinConversationAsGuest(
            token,
            displayName
          );

        if (isReady) {
          await broadcastConversationUpdated();
        }

        router.push(
          `/chat/${result.conversationPublicId}`
        );
      } catch (err) {
        console.error(err);
        setError(
          "Could not join the conversation."
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6"
    >
      <label
        htmlFor="displayName"
        className="mb-2 block text-sm font-medium"
      >
        Your name
      </label>

      <input
        id="displayName"
        type="text"
        value={displayName}
        onChange={(event) =>
          setDisplayName(event.target.value)
        }
        required
        maxLength={50}
        placeholder="Enter your name"
        autoComplete="name"
        disabled={isPending}
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring disabled:opacity-50"
      />

      {error && (
        <div className="mt-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={
          isPending || !displayName.trim()
        }
        className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending
          ? "Joining..."
          : "Join conversation"}
      </button>
    </form>
  );
}