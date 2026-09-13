"use client";

import { useState, useTransition } from "react";
import { updateGoogleConnectionMode } from "@/app/actions";

export function ConnectionModeSelect({ value, personalAvailable }: { value: string; personalAvailable: boolean }) {
  const [mode, setMode] = useState(value);
  const [pending, startTransition] = useTransition();
  return (
    <label className="mt-3 block text-xs text-muted-foreground">
      Connection mode
      <select
        aria-label="Gemini connection mode"
        value={mode}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          const previous = mode;
          setMode(next);
          startTransition(async () => {
            try { await updateGoogleConnectionMode(next); }
            catch { setMode(previous); }
          });
        }}
        className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
      >
        <option value="api">API</option>
        <option value="personal" disabled={!personalAvailable}>Personal Account</option>
      </select>
    </label>
  );
}
