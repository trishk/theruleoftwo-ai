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
  function toggleMention(mention: string) {
    const escapedMention = mention.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const mentionRegex = new RegExp(
      `${escapedMention}\\s*`,
      "gi"
    );

    if (
      message
        .toLowerCase()
        .includes(mention.toLowerCase())
    ) {
      onChange(
        message
          .replace(mentionRegex, "")
          .trimStart()
      );

      return;
    }

    const trimmed = message.trimStart();

    onChange(
      `${mention} ${trimmed}`.trimEnd() + " "
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
          const isSelected = message
            .toLowerCase()
            .includes(provider.mention);

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
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? `border-current bg-muted ${provider.colorClass}`
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              @{provider.name}
            </button>
          );
        })}
    </div>
  );
}