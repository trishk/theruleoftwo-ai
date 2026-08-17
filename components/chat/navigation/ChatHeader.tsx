"use client";

import { useState, useTransition } from "react";
import { Check, Link2 } from "lucide-react";

import {
  createConversationInvite,
  renameConversation,
} from "@/app/actions";
import { LeaveConversationButton } from "./LeaveConversationButton";

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
  const [isEditing, setIsEditing] =
    useState(false);

  const [value, setValue] =
    useState(title);

  const [isPending, startTransition] =
    useTransition();

  const [copied, setCopied] =
    useState(false);

  function save() {
    if (!conversationId) {
      setIsEditing(false);
      return;
    }

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
      await renameConversation(
        conversationId,
        trimmed
      );

      setIsEditing(false);
    });
  }

  function copyInviteLink() {
    if (!conversationId) {
      return;
    }

    startTransition(async () => {
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
                setValue(title);
                setIsEditing(false);
              }
            }}
            className="w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <div className="min-w-0">
            {conversationId ? (
              <button
                type="button"
                onClick={() =>
                  setIsEditing(true)
                }
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