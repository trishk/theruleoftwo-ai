"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useRef,
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
import type { ConversationSummary } from "@/lib/chat/conversation-summary";
import { getConversationPresentation } from "@/lib/chat/conversation-presentation";

import { ConversationTypeIcon } from "./ConversationTypeIcon";
import { useOptionalConversationRealtime } from "../realtime/RealtimeConversationSync";
import { useOptionalSidebarRealtime } from "../realtime/RealtimeSidebarSync";

type Props = {
  chat: ConversationSummary;
  currentUserId: string;
  isGuest?: boolean;
};

export function ChatItem({
  chat,
  currentUserId,
}: Props) {
  const {
    id,
    publicId,
    title,
    ownerId,
    hasUnread,
  } = chat;
  const isOwner = ownerId === currentUserId;
  const presentation = getConversationPresentation(chat);
  const pathname = usePathname();
  const router = useRouter();

  const conversationRealtime =
    useOptionalConversationRealtime();

  const sidebarRealtime =
    useOptionalSidebarRealtime();

  const href = `/chat/${publicId}`;

  const isActive =
    pathname === href;
  const showUnread = hasUnread && !isActive;

  const [menuOpen, setMenuOpen] =
    useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const [isEditing, setIsEditing] =
    useState(false);

  const [value, setValue] =
    useState("");

  const [
    isPending,
    startTransition,
  ] = useTransition();

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function close(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
    };
  }, [menuOpen]);

  async function broadcastRename() {
    if (
      isActive &&
      conversationRealtime
    ) {
      await conversationRealtime
        .broadcastConversationUpdated();

      return;
    }

    if (sidebarRealtime) {
      await sidebarRealtime
        .broadcastConversationUpdated(
          publicId
        );
    }
  }

  function startEditing() {
    setValue(title);
    setMenuOpen(false);
    setIsEditing(true);
    setActionError(null);
  }

  function cancelEditing() {
    setValue("");
    setIsEditing(false);
    setActionError(null);
  }

  function save() {
    const trimmed =
      value.trim();

    if (
      !trimmed ||
      trimmed === title
    ) {
      cancelEditing();
      return;
    }

    startTransition(async () => {
      try {
        await renameConversation(
          id,
          trimmed
        );

        await broadcastRename();

        router.refresh();

        cancelEditing();
      } catch (error) {
        console.error(
          "Failed to rename conversation:",
          error
        );

        setActionError("Could not rename this conversation. Please try again.");
      }
    });
  }

  if (isEditing) {
    return (
      <div>
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
          if (
            event.key === "Enter"
          ) {
            save();
          }

          if (
            event.key === "Escape"
          ) {
            cancelEditing();
          }
        }}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
      {actionError && <p role="alert" className="mt-1 px-2 text-xs text-destructive">{actionError}</p>}
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        className={[
          "flex min-h-16 items-start gap-2.5 rounded-md px-3 py-2.5 pr-12 text-sm transition-colors md:pr-10",
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
        aria-label={showUnread ? `${title}, unread messages` : title}
      >
        <ConversationTypeIcon
          kind={presentation.iconKind}
          label={presentation.typeLabel}
          className="mt-0.5 h-7 w-7"
          decorative
        />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {title}
            </span>

            {showUnread && (
              <span
                aria-hidden="true"
                title="Unread messages"
                className="h-2 w-2 shrink-0 rounded-full bg-foreground"
              />
            )}
          </span>

          <span className="block truncate text-[11px] leading-4 font-normal text-muted-foreground">
            {presentation.metadataLabel}
          </span>

          <span
            className={[
              "block truncate text-xs text-muted-foreground",
              showUnread
                ? "font-medium text-foreground/80"
                : "font-normal",
            ].join(" ")}
          >
            {presentation.preview}
          </span>
        </span>
      </Link>

      {isOwner && (
        <button
          ref={triggerRef}
          type="button"
          aria-label="Chat options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Chat options"
          onClick={() =>
            setMenuOpen(
              (open) => !open
            )
          }
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-all hover:bg-background hover:text-foreground md:right-1 md:h-8 md:w-8 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      {isOwner && menuOpen && (
        <div ref={menuRef} role="menu" aria-label={`Options for ${title}`} className="absolute right-1 top-9 z-50 min-w-32 rounded-md border border-border bg-background p-1 shadow-md">
          <button
            type="button"
            role="menuitem"
            onClick={
              startEditing
            }
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            Rename
          </button>

          {isOwner && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);

                const confirmed =
                  window.confirm(
                    `Delete "${title}"? This cannot be undone.`
                  );

                if (
                  !confirmed
                ) {
                  return;
                }

                startTransition(
                  async () => {
                    try {
                      await deleteConversation(id);
                    } catch {
                      setActionError("Could not delete this conversation. Please try again.");
                    }
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
      {actionError && !isEditing && <p role="alert" className="px-3 pb-1 text-xs text-destructive">{actionError}</p>}
    </div>
  );
}
