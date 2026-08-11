"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeIntegration } from "@/app/actions";

type Props = {
  provider: string;
  providerName: string;
  configured: boolean;
};

export function RemoveIntegrationButton({
  provider,
  providerName,
  configured,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!configured) {
    return null;
  }

  function handleRemove() {
    startTransition(async () => {
      await removeIntegration(provider);
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Remove?
        </span>

        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
        >
          {isPending ? "Removing..." : "Remove"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Remove ${providerName}`}
      title={`Remove ${providerName}`}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}