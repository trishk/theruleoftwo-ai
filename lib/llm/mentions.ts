import type { Provider } from "./types";
import { PROVIDER_LIST } from "./providerMeta";

export function extractMentions(content: string): Provider[] {
  return PROVIDER_LIST
    .filter((provider) =>
      createMentionRegex(provider.mention).test(content)
    )
    .map((provider) => provider.id);
}

function createMentionRegex(mention: string, global = false): RegExp {
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
    global ? "giu" : "iu"
  );
}

export function removeAiMentions(content: string): string {
  return PROVIDER_LIST.reduce(
    (current, provider) =>
      current.replace(createMentionRegex(provider.mention, true), ""),
    content
  );
}
