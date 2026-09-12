"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { leaveConversation } from "@/app/actions";
import { useConversationRealtime } from "../realtime/RealtimeConversationSync";

type Props = {
  conversationId: number;
  variant?: "standalone" | "menuitem";
};

export function LeaveConversationButton({
  conversationId,
  variant = "standalone",
}: Props) {
  const router =
    useRouter();

  const [
    isPending,
    startTransition,
  ] =
    useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    broadcastConversationUpdated,
    isReady,
  } =
    useConversationRealtime();

  function handleLeave() {
    setError(null);
    const confirmed =
      window.confirm(
        "Leave this conversation?"
      );

    if (!confirmed) {
      return;
    }

    startTransition(
      async () => {
        try {
          const result =
            await leaveConversation(
              conversationId
            );

          if (isReady) {
            await broadcastConversationUpdated();
          }

          if (
            result.signedOut
          ) {
            router.push(
              "/login"
            );

            router.refresh();
            return;
          }

          if (
            result.nextConversationId
          ) {
            router.push(
              `/chat/${result.nextConversationPublicId}`
            );

            router.refresh();
            return;
          }

          router.push("/");
          router.refresh();
        } catch (error) {
          console.error(
            "Failed to leave conversation:",
            error
          );
          setError("Could not leave this conversation. Please try again.");
        }
      }
    );
  }

  return (
    <div>
    <button
      type="button"
      onClick={
        handleLeave
      }
      disabled={
        isPending
      }
      role={variant === "menuitem" ? "menuitem" : undefined}
      className={variant === "menuitem" ? "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-muted disabled:opacity-50" : "flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"}
    >
      <LogOut className="h-4 w-4" />

      {isPending
        ? "Leaving..."
        : "Leave"}
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
