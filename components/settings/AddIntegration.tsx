"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { saveIntegrationApiKey } from "@/app/actions";
import { PROVIDERS } from "@/lib/llm/providers";

type Props = {
  configuredProviders: string[];
  onClose: () => void;
};

export function AddIntegration({
  configuredProviders,
  onClose,
}: Props) {
  const [provider, setProvider] =
    useState<keyof typeof PROVIDERS>("openai");

  const [apiKey, setApiKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isReplacing = configuredProviders.includes(provider);

  function handleClose() {
    setApiKey("");
    setError(null);
    onClose();
  }

  function handleSave() {
    if (!apiKey.trim()) {
      setError("API key is required.");
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        await saveIntegrationApiKey(provider, apiKey);

        setApiKey("");
        onClose();
      } catch (err) {
        setError("Could not save integration.");
      }
    });
  }

  return (
    <div className="w-full rounded-lg border border-border bg-card p-4">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Add integration</h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Connect an AI provider using your API key.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          title="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <label
            htmlFor="provider"
            className="mb-1.5 block text-sm font-medium"
          >
            Provider
          </label>

          <select
            id="provider"
            value={provider}
            onChange={(e) => {
              setProvider(
                e.target.value as keyof typeof PROVIDERS
              );
              setError(null);
            }}
            disabled={isPending}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {Object.entries(PROVIDERS).map(([id, config]) => (
              <option key={id} value={id}>
                {config.displayName}
              </option>
            ))}
          </select>

          {isReplacing && (
            <p className="mt-2 text-xs text-amber-500">
              This provider is already configured. Saving will
              replace the existing API key.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="apiKey"
            className="mb-1.5 block text-sm font-medium"
          >
            API key
          </label>

          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isPending) {
                handleSave();
              }
            }}
            placeholder={
              isReplacing
                ? "Paste new API key"
                : "Paste API key"
            }
            autoComplete="off"
            disabled={isPending}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />

          <p className="mt-1.5 text-xs text-muted-foreground">
            Your API key is encrypted before being stored.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="h-9 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !apiKey.trim()}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? "Saving..."
            : isReplacing
              ? "Replace integration"
              : "Save integration"}
        </button>
      </div>
    </div>
  );
}