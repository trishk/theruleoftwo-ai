import { beforeEach, describe, expect, it, vi } from "vitest";
const { generateTextMock, streamTextMock, createModelMock } = vi.hoisted(() => ({ generateTextMock: vi.fn(), streamTextMock: vi.fn(), createModelMock: vi.fn(() => ({ modelId: "model" })) }));
vi.mock("ai", () => ({ generateText: generateTextMock, streamText: streamTextMock }));
vi.mock("@/lib/llm/provider-runners", () => ({ PROVIDER_RUNNERS: { openai: { createModel: createModelMock }, anthropic: { createModel: createModelMock }, google: { createModel: createModelMock } } }));
import { askLLM, streamLLM } from "@/lib/llm/registry";
import { SHARED_CONTEXT_INSTRUCTIONS } from "@/lib/llm/context";

describe("AI SDK retry policy", () => {
  beforeEach(() => { vi.clearAllMocks(); streamTextMock.mockReturnValue({}); generateTextMock.mockResolvedValue({ text: "ok" }); });
  it.each(["openai", "anthropic", "google"] as const)("passes retry and output limits to streamText for %s", (provider) => { streamLLM({ provider, model: provider === "openai" ? "gpt-5" : provider === "anthropic" ? "claude-haiku-4-5" : "gemini-3.6-flash", messages: [], maxOutputTokens: 8192 }); expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 8192 })); });
  it.each(["openai", "anthropic", "google"] as const)("passes retry and output limits to generateText for %s", async (provider) => { await askLLM({ provider, messages: [], maxOutputTokens: 8192 }); expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 8192 })); });
  it.each(["openai", "anthropic", "google"] as const)("passes the same shared output contract without structured-output options for %s", (provider) => {
    streamLLM({
      provider,
      model: provider === "openai" ? "gpt-5" : provider === "anthropic" ? "claude-haiku-4-5" : "gemini-3.6-flash",
      instructions: SHARED_CONTEXT_INSTRUCTIONS,
      messages: [{ role: "user", content: "{}" }],
      maxOutputTokens: 8192,
    });

    const options = streamTextMock.mock.calls[0][0];
    expect(options.instructions).toBe(SHARED_CONTEXT_INSTRUCTIONS);
    expect(options).not.toHaveProperty("responseFormat");
    expect(options).not.toHaveProperty("response_format");
    expect(options).not.toHaveProperty("schema");
    expect(options).not.toHaveProperty("output");
    expect(options).not.toHaveProperty("providerOptions");
  });
});
