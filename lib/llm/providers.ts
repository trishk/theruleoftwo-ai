export const PROVIDERS = {
  openai: {
    displayName: "ChatGPT",
    defaultModel: "gpt-5-mini",
    models: [
      "gpt-5-mini",
      "gpt-5",
    ],
  },
  anthropic: {
    displayName: "Claude",
    defaultModel: "claude-haiku-4-5",
    models: [
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
    ],
  },
  google: {
    displayName: "Gemini",
    defaultModel: "gemini-3.6-flash",
    models: [
      "gemini-3.6-flash",
      "gemini-3.6-pro",
    ],
  },
} as const;