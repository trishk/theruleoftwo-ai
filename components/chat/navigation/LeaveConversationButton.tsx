"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { leaveConversation } from "@/app/actions";
import { useConversationRealtime } from "../realtime/RealtimeConversationSync";

type Props = {
  conversationId: number;
};

export function LeaveConversationButton({
  conversationId,
}: Props) {
  const router = useRouter();

  const [isPending, startTransition] =
    useTransition();

  const {
    broadcastConversationUpdated,
    isReady,
  } = useConversationRealtime();

  function handleLeave() {
    const confirmed = window.confirm(
      "Leave this conversation?"
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      await leaveConversation(conversationId);

      if (isReady) {
        await broadcastConversationUpdated();
      }

      router.push("/");
    });
  }

  return (
    <button
      type="button"
      onClick={handleLeave}
      disabled={isPending}
      className="flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      {isPending ? "Leaving..." : "Leave"}
    </button>
  );
}