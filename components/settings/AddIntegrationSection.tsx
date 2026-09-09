"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { AddIntegration } from "./AddIntegration";
import type { Provider } from "@/lib/llm/types";

type Props = {
  configuredProviders: Provider[];
};

export function AddIntegrationSection({
  configuredProviders,
}: Props) {
  const [open, setOpen] =
    useState(false);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef(false);

  useEffect(() => {
    if (!open && returnFocusRef.current) {
      addButtonRef.current?.focus();
      returnFocusRef.current = false;
    }
  }, [open]);

  function closeIntegration() {
    returnFocusRef.current = true;
    setOpen(false);
  }

  return (
    <div>
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">
            AI Integrations
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Configure the AI providers
            available in your
            conversations.
          </p>
        </div>

        {!open && (
          <button
            ref={addButtonRef}
            type="button"
            onClick={() =>
              setOpen(true)
            }
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted sm:h-9 sm:min-h-0"
          >
            <Plus className="h-4 w-4" />
            Add integration
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4">
          <AddIntegration
            configuredProviders={
              configuredProviders
            }
            onClose={closeIntegration}
          />
        </div>
      )}
    </div>
  );
}
