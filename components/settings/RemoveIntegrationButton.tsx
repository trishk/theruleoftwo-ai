"use client";

import {
  useState,
  useTransition,
} from "react";
import { Trash2 } from "lucide-react";

import { removeIntegration } from "@/app/actions";
import type { Provider } from "@/lib/llm/types";

type Props = {
  provider: Provider;
  providerName: string;
  configured: boolean;
};

export function RemoveIntegrationButton({
  provider,
  providerName,
  configured,
}: Props) {
  const [confirming, setConfirming] =
    useState(false);

  const [isPending, startTransition] =
    useTransition();

  if (!configured) {
    return null;
  }

  function handleRemove() {
    startTransition(async () => {
      await removeIntegration(
        provider
      );

      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          Remove?
        </span>

        <button
          type="button"
          onClick={() =>
            setConfirming(false)
          }
          disabled={isPending}
          className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 sm:min-h-0 sm:px-0"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="min-h-11 px-2 text-xs font-medium text-destructive hover:underline disabled:opacity-50 sm:min-h-0 sm:px-0"
        >
          {isPending
            ? "Removing..."
            : "Remove"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        setConfirming(true)
      }
      aria-label={`Remove ${providerName}`}
      title={`Remove ${providerName}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive sm:h-8 sm:w-8"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
