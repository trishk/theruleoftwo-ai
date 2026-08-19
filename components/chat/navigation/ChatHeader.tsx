"use client";

import {
  useState,
  useTransition,
} from "react";
import {
  Bot,
  Check,
  Link2,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  createConversationInvite,
  renameConversation,
} from "@/app/actions";

import { LeaveConversationButton } from "./LeaveConversationButton";
import { useOptionalConversationRealtime } from "../realtime/RealtimeConversationSync";

type Props = {
  conversationId?: number;
  title?: string;
  isOwner?: boolean;
  isGuest?: boolean;
  participants?: string[];
};

export function ChatHeader({
  conversationId,
  title = "Conversation",
  isOwner = false,
  isGuest = false,
  participants = [],
}: Props) {
  const conversationRealtime =
    useOptionalConversationRealtime();

  const [isEditing, setIsEditing] =
    useState(false);

  const [value, setValue] =
    useState("");

  const [
    isPending,
    startTransition,
  ] = useTransition();

  const [copied, setCopied] =
    useState(false);

  const hasMultipleHumans =
    participants.length > 1;

  function startEditing() {
    setValue(title);
    setIsEditing(true);
  }

  function cancelEditing() {
    setValue("");
    setIsEditing(false);
  }

  function save() {
    if (!conversationId) {
      cancelEditing();
      return;
    }

    const trimmed = value.trim();

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
          conversationId,
          trimmed
        );

        if (conversationRealtime) {
          await conversationRealtime
            .broadcastConversationUpdated();
        }

        cancelEditing();
      } catch (error) {
        console.error(
          "Failed to rename conversation:",
          error
        );

        cancelEditing();
      }
    });
  }

  function copyInviteLink() {
    if (!conversationId) {
      return;
    }

    startTransition(async () => {
      try {
        const token =
          await createConversationInvite(
            conversationId
          );

        const inviteUrl =
          `${window.location.origin}/invite/${token}`;

        await navigator.clipboard.writeText(
          inviteUrl
        );

        setCopied(true);

        window.setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (error) {
        console.error(
          "Failed to create invite:",
          error
        );
      }
    });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border pl-16 pr-4 md:px-6">
      <div className="min-w-0 flex-1">
        {isEditing ? (
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
            className="w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <div className="min-w-0">
            {conversationId ? (
              <button
                type="button"
                onClick={startEditing}
                className="max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
              >
                {title}
              </button>
            ) : (
              <span className="truncate text-sm font-medium text-foreground">
                {title}
              </span>
            )}

            {participants.length > 1 && (
              <div className="truncate text-xs text-muted-foreground">
                {participants.join(
                  " · "
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {conversationId && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background">
              {hasMultipleHumans ? (
                <UsersRound className="h-4 w-4" />
              ) : (
                <UserRound className="h-4 w-4" />
              )}
            </span>

            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background">
              <Bot className="h-4 w-4" />
            </span>
          </div>
        )}

        {conversationId &&
          isGuest && (
            <LeaveConversationButton
              conversationId={
                conversationId
              }
            />
          )}

        {conversationId &&
          isOwner && (
            <button
              type="button"
              onClick={
                copyInviteLink
              }
              disabled={
                isPending
              }
              className="flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}

              {copied
                ? "Copied"
                : "Invite"}
            </button>
          )}
      </div>
    </header>
  );
}