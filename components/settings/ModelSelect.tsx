"use client";

import { useState, useTransition } from "react";
import { updateSelectedModel } from "@/app/actions";

type Props = {
  provider: string;
  models: readonly string[];
  selectedModel: string;
};

export function ModelSelect({
  provider,
  models,
  selectedModel,
}: Props) {
  const [value, setValue] = useState(selectedModel);
  const [isPending, startTransition] = useTransition();

  function handleChange(model: string) {
    setValue(model);

    startTransition(async () => {
      await updateSelectedModel(provider, model);
    });
  }

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value)}
      className="mt-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    >
      {models.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}