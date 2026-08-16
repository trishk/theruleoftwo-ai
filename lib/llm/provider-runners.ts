import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const PROVIDER_RUNNERS = {
  openai: {
    createModel: (
      model: string,
      apiKey?: string
    ) => {
      const client = createOpenAI(
        apiKey ? { apiKey } : {}
      );

      return client(model);
    },
  },

  anthropic: {
    createModel: (
      model: string,
      apiKey?: string
    ) => {
      const client = createAnthropic(
        apiKey ? { apiKey } : {}
      );

      return client(model);
    },
  },

  google: {
    createModel: (
      model: string,
      apiKey?: string
    ) => {
      const client =
        createGoogleGenerativeAI(
          apiKey ? { apiKey } : {}
        );

      return client(model);
    },
  },
} as const;