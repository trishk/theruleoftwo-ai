"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  deleteConversation,
  renameConversation,
} from "@/app/actions";

type Props = {
  id: number;
  title: string;
  isOwner: boolean;
};

export function ChatItem({ id, title, isOwner }: Props) {
  const pathname = usePathname();
  const href = `/chat/${id}`;
  const isActive = pathname === href;

  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    const trimmed = value.trim();

    if (!trimmed || trimmed === title) {
      setValue(title);
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      await renameConversation(id, trimmed);
      setIsEditing(false);
    });
  };

  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={isPending}
        maxLength={100}
        onChange={(event) => setValue(event.target.value)}
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
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        className={[
          "block truncate rounded-md px-3 py-2 pr-9 text-sm transition-colors",
          isActive
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ].join(" ")}
        title={title}
      >
        {title}
      </Link>

      <button
        type="button"
        aria-label="Chat options"
        title="Chat options"
        onClick={() => setMenuOpen((open) => !open)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div className="absolute right-1 top-9 z-50 min-w-32 rounded-md border border-border bg-background p-1 shadow-md">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setIsEditing(true);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            Rename
          </button>
          {isOwner && (
  <button
    type="button"
    onClick={() => {
      setMenuOpen(false);

      const confirmed = window.confirm(
        `Delete "${title}"? This cannot be undone.`
      );

      if (!confirmed) {
        return;
      }

      startTransition(async () => {
        await deleteConversation(id);
      });
    }}
    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-muted"
  >
    <Trash2 className="h-4 w-4" />
    Delete
  </button>
)}
        </div>
      )}
    </div>
  );
}