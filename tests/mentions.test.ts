import { describe, expect, it } from "vitest";

import { extractMentions, removeAiMentions } from "@/lib/llm/mentions";

describe("AI mention lexical matching", () => {
  it.each([
    ["@chatgpt hello", ["openai"]],
    ["Ask @CLAUDE, please", ["anthropic"]],
    ["(@gemini)", ["google"]],
    ["@chatgpt and @gemini", ["openai", "google"]],
    ["@chatgpt @claude @gemini", ["openai", "anthropic", "google"]],
  ])("recognizes valid mentions in %s", (content, providers) => {
    expect(extractMentions(content)).toEqual(providers);
  });

  it.each([
    "@chatgptxyz",
    "@claude_2",
    "prefix@Gemini",
    "name@chatgpt.com",
  ])("rejects false positive %s", (content) => {
    expect(extractMentions(content)).toEqual([]);
  });

  it("removes only lexically valid mentions", () => {
    expect(removeAiMentions("@ChatGPT Topic @chatgptxyz, @claude!"))
      .toBe(" Topic @chatgptxyz, !");
  });
});
