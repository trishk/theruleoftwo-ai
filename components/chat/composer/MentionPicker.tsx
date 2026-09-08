import Link from "next/link";

import { ProviderIcon } from "@/components/brand/ProviderIcon";
import type { ProviderMeta } from "@/lib/llm/providerMeta";

type Props = {
  open: boolean;
  disabled?: boolean;
  options: ProviderMeta[];
  activeIndex: number;
  listboxId: string;
  onTrigger: () => void;
  onSelect: (option: ProviderMeta) => void;
};

export function MentionPicker({
  open,
  disabled = false,
  options,
  activeIndex,
  listboxId,
  onTrigger,
  onSelect,
}: Props) {
  return (
    <>
      <button
        type="button"
        aria-label="Mention an AI"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={onTrigger}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 md:h-10 md:w-10"
      >
        @
      </button>

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="AI mentions"
          className="absolute inset-x-2 bottom-full z-20 mb-2 max-h-52 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-background p-1 shadow-lg"
        >
          {options.length === 0 ? (
            <div
              role="status"
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              No matching AI
            </div>
          ) : (
            options.map((provider, index) => (
              <button
                key={provider.id}
                type="button"
                id={`${listboxId}-${provider.id}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(provider)}
                className={[
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  index === activeIndex
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                ].join(" ")}
              >
                <ProviderIcon provider={provider.id} size={16} decorative />
                <span className="font-medium">{provider.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {provider.mention}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}

export function NoConfiguredAiNotice() {
  return (
    <div className="mb-2 text-xs text-muted-foreground">
      No AI providers are connected.{" "}
      <Link
        href="/settings#integrations"
        className="font-medium text-foreground underline underline-offset-2"
      >
        Configure Integrations
      </Link>
    </div>
  );
}
