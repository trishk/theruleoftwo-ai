export const PROVIDERS = {
  openai: {
    displayName: "ChatGPT",
    defaultModel: "gpt-5-mini",
  },
  anthropic: {
    displayName: "Claude",
    defaultModel: "claude-haiku-4-5",
  },
  google: {
    displayName: "Gemini",
    defaultModel: "",
  },
} as const;