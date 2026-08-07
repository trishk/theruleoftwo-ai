import type { Provider } from "./types";

const MENTION_MAP: Record<string, Provider> = {
  "@chatgpt": "openai",
  "@claude": "anthropic",
  "@gemini": "google",
};

export function extractMentions(content: string): Provider[] {
  const normalized = content.toLowerCase();

  return Object.entries(MENTION_MAP)
    .filter(([mention]) => normalized.includes(mention))
    .map(([, provider]) => provider);
}