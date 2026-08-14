"use client";

import { useState, useTransition } from "react";
import { renameConversation } from "@/app/actions";

type Props = {
  conversationId?: number;
  title?: string;
};

export function ChatHeader({
  conversationId,
  title = "Conversation",
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    if (!conversationId) {
      setIsEditing(false);
      return;
    }

    const trimmed = value.trim();

    if (!trimmed || trimmed === title) {
      setValue(title);
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      await renameConversation(
        conversationId,
        trimmed
      );

      setIsEditing(false);
    });
  };
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border pl-16 pr-4 md:px-6">
      {isEditing ? (
        <input
          autoFocus
          value={value}
          disabled={isPending}
          maxLength={100}
          onChange={(event) =>
            setValue(event.target.value)
          }
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              save();
            }

            if (event.key === "Escape") {
              setValue(title);
              setIsEditing(false);
            }
          }}
          className="w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      ) : conversationId ? (
    <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="truncate text-left text-sm font-medium text-foreground hover:underline"
    >
        {title}
    </button>
) : (
    <span className="truncate text-sm font-medium text-foreground">
        {title}
    </span>
)}
    </header>
  );
}