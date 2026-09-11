import { beforeEach, describe, expect, it, vi } from "vitest";
const { generateTextMock, streamTextMock, createModelMock } = vi.hoisted(() => ({ generateTextMock: vi.fn(), streamTextMock: vi.fn(), createModelMock: vi.fn(() => ({ modelId: "model" })) }));
vi.mock("ai", () => ({ generateText: generateTextMock, streamText: streamTextMock }));
vi.mock("@/lib/llm/provider-runners", () => ({ PROVIDER_RUNNERS: { openai: { createModel: createModelMock }, anthropic: { createModel: createModelMock }, google: { createModel: createModelMock } } }));
import { askLLM, streamLLM } from "@/lib/llm/registry";

describe("AI SDK retry policy", () => {
  beforeEach(() => { vi.clearAllMocks(); streamTextMock.mockReturnValue({}); generateTextMock.mockResolvedValue({ text: "ok" }); });
  it.each(["openai", "anthropic", "google"] as const)("passes maxRetries zero to streamText for %s", (provider) => { streamLLM({ provider, model: provider === "openai" ? "gpt-5" : provider === "anthropic" ? "claude-haiku-4-5" : "gemini-3.6-flash", messages: [] }); expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 })); });
  it.each(["openai", "anthropic", "google"] as const)("passes maxRetries zero to generateText for %s", async (provider) => { await askLLM({ provider, messages: [] }); expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 })); });
});
