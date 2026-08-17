"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  deleteConversation,
  renameConversation,
} from "@/app/actions";

import { useConversationRealtime } from "../realtime/RealtimeConversationSync";
import { useSidebarRealtime } from "../realtime/RealtimeSidebarSync";

type Props = {
  id: number;
  title: string;
  isOwner: boolean;
  isGuest?: boolean;
  hasUnread?: boolean;
};

export function ChatItem({
  id,
  title,
  isOwner,
  hasUnread = false,
}: Props) {
  const pathname = usePathname();

  const href = `/chat/${id}`;
  const isActive = pathname === href;

  const {
    broadcastConversationUpdated:
      broadcastActiveConversationUpdated,
  } = useConversationRealtime();

  const {
    broadcastConversationUpdated:
      broadcastInactiveConversationUpdated,
  } = useSidebarRealtime();

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [isEditing, setIsEditing] =
    useState(false);

  const [value, setValue] =
    useState(title);

  const [
    isPending,
    startTransition,
  ] = useTransition();

  useEffect(() => {
    if (!isEditing) {
      setValue(title);
    }
  }, [title, isEditing]);

  async function broadcastRename() {
    if (isActive) {
      await broadcastActiveConversationUpdated();
      return;
    }

    await broadcastInactiveConversationUpdated(
      id
    );
  }

  function startEditing() {
    setValue(title);
    setMenuOpen(false);
    setIsEditing(true);
  }

  function save() {
    const trimmed = value.trim();

    if (
      !trimmed ||
      trimmed === title
    ) {
      setValue(title);
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      try {
        await renameConversation(
          id,
          trimmed
        );

        await broadcastRename();

        setIsEditing(false);
      } catch (error) {
        console.error(
          "Failed to rename conversation:",
          error
        );

        setValue(title);
        setIsEditing(false);
      }
    });
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={isPending}
        maxLength={100}
        onChange={(event) =>
          setValue(
            event.target.value
          )
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
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        className={[
          "flex items-center gap-2 rounded-md px-3 py-2 pr-9 text-sm transition-colors",
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          hasUnread
            ? "font-semibold text-foreground"
            : isActive
              ? "font-medium"
              : "",
        ].join(" ")}
        title={title}
      >
        <span className="min-w-0 flex-1 truncate">
          {title}
        </span>

        {hasUnread && !isActive && (
          <span
            aria-label="Unread messages"
            title="Unread messages"
            className="h-2 w-2 shrink-0 rounded-full bg-foreground"
          />
        )}
      </Link>

      <button
        type="button"
        aria-label="Chat options"
        title="Chat options"
        onClick={() =>
          setMenuOpen(
            (open) => !open
          )
        }
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div className="absolute right-1 top-9 z-50 min-w-32 rounded-md border border-border bg-background p-1 shadow-md">
          <button
            type="button"
            onClick={startEditing}
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

                const confirmed =
                  window.confirm(
                    `Delete "${title}"? This cannot be undone.`
                  );

                if (!confirmed) {
                  return;
                }

                startTransition(
                  async () => {
                    await deleteConversation(
                      id
                    );
                  }
                );
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