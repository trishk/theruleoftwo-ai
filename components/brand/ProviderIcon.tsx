import Image from "next/image";

import type { Provider } from "@/lib/llm/types";

type Props = {
  provider: Provider;
  size?: number;
  className?: string;
  decorative?: boolean;
};

const PROVIDER_ICONS: Record<
  Provider,
  {
    src: string;
    alt: string;
  }
> = {
  openai: {
    src: "/providers/openai.svg",
    alt: "OpenAI",
  },

  anthropic: {
    src: "/providers/anthropic.svg",
    alt: "Anthropic",
  },

  google: {
    src: "/providers/gemini.svg",
    alt: "Gemini",
  },
};

export function ProviderIcon({
  provider,
  size = 16,
  className = "",
  decorative = false,
}: Props) {
  const icon =
    PROVIDER_ICONS[provider];

  return (
    <Image
      src={icon.src}
      alt={decorative ? "" : icon.alt}
      width={size}
      height={size}
      className={[
        "shrink-0 object-contain",
        provider === "openai"
          ? "dark:invert"
          : "",
        className,
      ].join(" ")}
    />
  );
}
