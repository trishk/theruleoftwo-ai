import Link from "next/link";

import { ProviderIcon } from "@/components/brand/ProviderIcon";
import { PROVIDER_LIST } from "@/lib/llm/providerMeta";
import type { Provider } from "@/lib/llm/types";

type Props = {
  message: string;
  configuredProviders: Provider[];
  disabled?: boolean;
  onChange: (message: string) => void;
};

export function MentionPicker({
  message,
  configuredProviders,
  disabled = false,
  onChange,
}: Props) {
  if (configuredProviders.length === 0) {
    return (
      <div className="mb-2 text-xs text-muted-foreground">
        No AI providers are connected. Human-only messages still work.{" "}
        <Link
          href="/settings#integrations"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Configure Integrations
        </Link>
      </div>
    );
  }

  function toggleMention(
    mention: string
  ) {
    const escapedMention =
      mention.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const mentionRegex =
      new RegExp(
        `${escapedMention}\\s*`,
        "gi"
      );

    if (
      message
        .toLowerCase()
        .includes(
          mention.toLowerCase()
        )
    ) {
      onChange(
        message
          .replace(
            mentionRegex,
            ""
          )
          .trimStart()
      );

      return;
    }

    const trimmed =
      message.trimStart();

    onChange(
      `${mention} ${trimmed}`.trimEnd() +
        " "
    );
  }

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {PROVIDER_LIST
        .filter((provider) =>
          configuredProviders.includes(
            provider.id
          )
        )
        .map((provider) => {
          const isSelected =
            message
              .toLowerCase()
              .includes(
                provider.mention
              );

          return (
            <button
              key={provider.mention}
              type="button"
              onClick={() =>
                toggleMention(
                  provider.mention
                )
              }
              disabled={disabled}
              className={[
                "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:min-w-0",
                isSelected
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <ProviderIcon
                provider={provider.id}
                size={14}
              />

              <span>
                {provider.name}
              </span>
            </button>
          );
        })}
    </div>
  );
}
