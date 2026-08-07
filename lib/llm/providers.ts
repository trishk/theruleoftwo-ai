export const PROVIDERS = {
  openai: {
    displayName: "ChatGPT",
    defaultModel: "gpt-5-mini",
  },
  anthropic: {
    displayName: "Claude",
    defaultModel: "",
  },
  google: {
    displayName: "Gemini",
    defaultModel: "",
  },
} as const;