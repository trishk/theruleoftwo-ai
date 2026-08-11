import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { PROVIDERS } from "./providers";
import type {
    LLMRequest,
    LLMResponse,
} from "./types";

export async function askOpenAI(
    request: LLMRequest
): Promise<LLMResponse> {
    const startedAt = Date.now();

    const model =
        request.model ?? PROVIDERS.openai.defaultModel;

    const openai = createOpenAI(
        request.apiKey
            ? {
                apiKey: request.apiKey,
            }
            : {}
    );

    const result = await generateText({
        model: openai(model),
        instructions: request.instructions,
        messages: request.messages,
    });

    return {
        provider: "openai",
        model,
        text: result.text,
        latencyMs: Date.now() - startedAt,
    };
}