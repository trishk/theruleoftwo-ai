"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Check,
  Link2,
  Link2Off,
  MoreHorizontal,
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
import { UsageCostDialog } from "./UsageCostDialog";
import type { ConversationUsageSummary } from "@/lib/llm/usage/conversation-usage";

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
  usageSummary?: ConversationUsageSummary | null;
};

export function ChatHeader({
  conversationId,
  title = "Conversation",
  isOwner = false,
  allowMemberAiUsage = false,
  activeInvite = null,
  summary,
  usageSummary = null,
}: Props) {
  const conversationRealtime =
    useOptionalConversationRealtime();

  const [isEditing, setIsEditing] =
    useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileUsageTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!mobileMenuOpen) return;
    mobileMenuRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        mobileTriggerRef.current?.focus();
      }
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !mobileMenuRef.current?.contains(target) && !mobileTriggerRef.current?.contains(target)) {
        setMobileMenuOpen(false);
        mobileTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [mobileMenuOpen]);

  function startEditing() {
    setActionError(null);
    setValue(title);
    setIsEditing(true);
  }

  function cancelEditing() {
    setValue("");
    setIsEditing(false);
    setActionError(null);
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

        setActionError("Could not rename this conversation. Please try again.");
      }
    });
  }

  function copyInviteLink() {
    setActionError(null);
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

        try {
          await navigator.clipboard.writeText(inviteUrl);
        } catch {
          setActionError("Invite created, but its link could not be copied.");
          return;
        }

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
        setActionError("Could not create an invite. Please try again.");
      }
    });
  }

  function toggleAiSharing() {
    setActionError(null);
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
        setActionError("Could not change AI sharing. Please try again.");
      }
    });
  }

  function revokeInvite() {
    setActionError(null);
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
        setActionError("Could not revoke the invite. Please try again.");
      }
    });
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pl-16 pr-2 md:gap-4 md:px-6">
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

      <div className="hidden shrink-0 items-center gap-2 md:flex">
        {conversationId && isOwner && usageSummary && (usageSummary.providerInvokedAttemptCount > 0 || usageSummary.legacyAttemptCount > 0) && (
          <UsageCostDialog conversationId={conversationId} summary={usageSummary} />
        )}
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
      {conversationId && (
        <div className="relative shrink-0 md:hidden">
          <button
            ref={mobileTriggerRef}
            type="button"
            aria-label="Conversation actions"
            aria-haspopup="menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          {mobileMenuOpen && (
            <div ref={mobileMenuRef} role="menu" aria-label="Conversation actions" className="absolute right-0 top-full z-40 mt-1 w-64 max-w-[calc(100vw-5rem)] rounded-lg border border-border bg-background p-1 shadow-lg">
              {isOwner && usageSummary && (usageSummary.providerInvokedAttemptCount > 0 || usageSummary.legacyAttemptCount > 0) && (
                <button role="menuitem" type="button" onClick={() => { setMobileMenuOpen(false); mobileUsageTriggerRef.current?.click(); }} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted">Usage &amp; Cost</button>
              )}
              {!isOwner && <LeaveConversationButton conversationId={conversationId} variant="menuitem" />}
              {isOwner && (
                <>
                  <button role="menuitem" type="button" onClick={() => { setMobileMenuOpen(false); toggleAiSharing(); }} disabled={isPending} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted disabled:opacity-50">AI sharing: {sharingEnabled ? "On" : "Off"}</button>
                  <button role="menuitem" type="button" onClick={() => { setMobileMenuOpen(false); copyInviteLink(); }} disabled={isPending} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted disabled:opacity-50">{copied ? "Copied" : "Invite"}</button>
                  {invite && <button role="menuitem" type="button" onClick={() => { setMobileMenuOpen(false); revokeInvite(); }} disabled={isPending} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50">Revoke invite</button>}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {conversationId && isOwner && usageSummary && (usageSummary.providerInvokedAttemptCount > 0 || usageSummary.legacyAttemptCount > 0) && (
        <UsageCostDialog conversationId={conversationId} summary={usageSummary} triggerRef={mobileUsageTriggerRef} showTrigger={false} />
      )}
      {actionError && <p role="alert" className="absolute left-16 right-2 top-full z-30 rounded-b-md border border-t-0 border-border bg-background px-3 py-2 text-xs text-destructive md:left-auto md:right-6 md:max-w-md">{actionError}</p>}
    </header>
  );
}
