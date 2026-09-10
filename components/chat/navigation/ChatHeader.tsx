"use client";

import {
  useState,
  useTransition,
} from "react";
import {
  Check,
  Link2,
  Link2Off,
} from "lucide-react";

import {
  createConversationInvite,
  renameConversation,
  revokeConversationInvite,
  updateMemberAiUsage,
} from "@/app/actions";
import type { ConversationSummary } from "@/lib/chat/conversation-summary";
import { getConversationPresentation } from "@/lib/chat/conversation-presentation";

import { LeaveConversationButton } from "./LeaveConversationButton";
import { ConversationTypeIcon } from "./ConversationTypeIcon";
import { useOptionalConversationRealtime } from "../realtime/RealtimeConversationSync";

type Props = {
  conversationId?: number;
  title?: string;
  isOwner?: boolean;
  allowMemberAiUsage?: boolean;
  activeInvite?: {
    id: number;
    token: string;
    usageCount: number;
  } | null;
  summary?: ConversationSummary;
};

export function ChatHeader({
  conversationId,
  title = "Conversation",
  isOwner = false,
  allowMemberAiUsage = false,
  activeInvite = null,
  summary,
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

  const activeInviteKey = activeInvite
    ? `${activeInvite.id}:${activeInvite.token}:${activeInvite.usageCount}`
    : null;

  const [sharingOverride, setSharingOverride] =
    useState<{
      conversationId?: number;
      baseValue: boolean;
      value: boolean;
    } | null>(null);

  const sharingEnabled =
    sharingOverride !== null &&
    sharingOverride.conversationId === conversationId &&
    sharingOverride.baseValue === allowMemberAiUsage
      ? sharingOverride.value
      : allowMemberAiUsage;

  const [inviteOverride, setInviteOverride] =
    useState<{
      conversationId?: number;
      baseKey: string | null;
      value: Props["activeInvite"];
    } | null>(null);

  const invite =
    inviteOverride !== null &&
    inviteOverride.conversationId === conversationId &&
    inviteOverride.baseKey === activeInviteKey
      ? inviteOverride.value
      : activeInvite;

  const inviteCopyKey = invite
    ? `${conversationId}:${invite.id}:${invite.token}`
    : null;

  const [copiedInviteKey, setCopiedInviteKey] =
    useState<string | null>(null);

  const copied =
    inviteCopyKey !== null &&
    copiedInviteKey === inviteCopyKey;

  const presentation = summary
    ? getConversationPresentation(summary)
    : null;

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
        const currentInvite = invite ??
          await createConversationInvite(
            conversationId
          );

        setInviteOverride({
          conversationId,
          baseKey: activeInviteKey,
          value: currentInvite,
        });

        const inviteUrl =
          `${window.location.origin}/invite/${currentInvite.token}`;

        await navigator.clipboard.writeText(
          inviteUrl
        );

        setCopiedInviteKey(
          `${conversationId}:${currentInvite.id}:${currentInvite.token}`
        );

        window.setTimeout(() => {
          setCopiedInviteKey(null);
        }, 2000);
      } catch (error) {
        console.error(
          "Failed to create invite:",
          error
        );
      }
    });
  }

  function toggleAiSharing() {
    if (!conversationId) {
      return;
    }

    const nextValue = !sharingEnabled;

    startTransition(async () => {
      try {
        await updateMemberAiUsage(
          conversationId,
          nextValue
        );
        setSharingOverride({
          conversationId,
          baseValue: allowMemberAiUsage,
          value: nextValue,
        });
      } catch (error) {
        console.error(
          "Failed to update AI sharing:",
          error
        );
      }
    });
  }

  function revokeInvite() {
    if (!invite) {
      return;
    }

    startTransition(async () => {
      try {
        await revokeConversationInvite(
          invite.id
        );
        setInviteOverride({
          conversationId,
          baseKey: activeInviteKey,
          value: null,
        });
        setCopiedInviteKey(null);
      } catch (error) {
        console.error(
          "Failed to revoke invite:",
          error
        );
      }
    });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border pl-16 pr-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {conversationId && presentation && (
          <ConversationTypeIcon
            kind={presentation.iconKind}
            label={presentation.typeLabel}
          />
        )}

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
                isOwner ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                  >
                    {title}
                  </button>
                ) : (
                  <span className="block truncate text-sm font-medium text-foreground">
                    {title}
                  </span>
                )
              ) : (
                <span className="truncate text-sm font-medium text-foreground">
                  {title}
                </span>
              )}

              {presentation && (
                <div className="truncate text-xs text-muted-foreground">
                  {presentation.metadataLabel}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {conversationId &&
          !isOwner && (
            <LeaveConversationButton
              conversationId={
                conversationId
              }
            />
          )}

        {conversationId &&
          isOwner && (
            <>
              <button
                type="button"
                onClick={toggleAiSharing}
                disabled={isPending}
                aria-pressed={sharingEnabled}
                aria-label={`${sharingEnabled ? "Disable" : "Enable"} shared AI usage. When enabled, members and guests can use your connected AI services, which may cost you money.`}
                title="When enabled, members and guests can use your connected AI services, which may cost you money."
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                AI sharing: {sharingEnabled ? "On" : "Off"}
              </button>

              <button
                type="button"
                onClick={copyInviteLink}
                disabled={isPending}
                className="flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}

                {copied ? "Copied" : "Invite"}
              </button>

              {invite && (
                <button
                  type="button"
                  onClick={revokeInvite}
                  disabled={isPending}
                  aria-label={`Revoke invite with ${10 - invite.usageCount} uses remaining`}
                  title={`${10 - invite.usageCount} invite uses remaining`}
                  className="flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Link2Off className="h-4 w-4" />
                  Revoke
                </button>
              )}
            </>
          )}
      </div>
    </header>
  );
}
