import type { Provider } from "./types";
import { PROVIDER_LIST } from "./providerMeta";

export function extractMentions(content: string): Provider[] {
  const normalized = content.toLowerCase();

  return PROVIDER_LIST
    .filter((provider) =>
      normalized.includes(provider.mention.toLowerCase())
    )
    .map((provider) => provider.id);
}