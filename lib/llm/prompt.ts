import type { Provider } from "./types";

const MENTIONS: Record<Provider, string> = {
  openai: "@chatgpt",
  anthropic: "@claude",
  google: "@gemini",
};

export function stripMention(
  content: string,
  provider: Provider
) {
  return content
    .replace(new RegExp(MENTIONS[provider], "ig"), "")
    .trim();
}