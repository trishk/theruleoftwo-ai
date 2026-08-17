"use client";

import { useState } from "react";
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

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
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
            type="button"
            onClick={() =>
              setOpen(true)
            }
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
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
            onClose={() =>
              setOpen(false)
            }
          />
        </div>
      )}
    </div>
  );
}