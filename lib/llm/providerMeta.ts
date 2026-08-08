import type { Provider } from "./types";

export type ProviderMeta = {
  id: Provider;
  name: string;
  mention: string;
  colorClass: string;
  dotClass: string;
};

export const PROVIDER_META: Record<Provider, ProviderMeta> = {
  openai: {
    id: "openai",
    name: "ChatGPT",
    mention: "@chatgpt",
    colorClass: "text-emerald-500",
    dotClass: "bg-emerald-500",
  },
  anthropic: {
    id: "anthropic",
    name: "Claude",
    mention: "@claude",
    colorClass: "text-orange-500",
    dotClass: "bg-orange-500",
  },
  google: {
    id: "google",
    name: "Gemini",
    mention: "@gemini",
    colorClass: "text-blue-500",
    dotClass: "bg-blue-500",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDER_META);