// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import type { ChatMessage } from "@/components/chat/conversation/types";

const {
    streamProviderResponseMock,
} = vi.hoisted(() => ({
    streamProviderResponseMock: vi.fn(),
}));

vi.mock(
    "@/components/chat/composer/streamProviderResponse",
    () => ({
        StreamRequestError: class StreamRequestError extends Error {
            status: number;
            retryAfterSeconds?: number;
            code?: "provider_not_configured";

            constructor(
                message: string,
                status: number,
                retryAfterSeconds?: number,
                code?: "provider_not_configured"
            ) {
                super(message);
                this.status = status;
                this.retryAfterSeconds =
                    retryAfterSeconds;
                this.code = code;
            }
        },
        streamProviderResponse:
            streamProviderResponseMock,
    })
);

import { useProviderGeneration } from "@/components/chat/composer/useProviderGeneration";

function useTestHarness() {
    const [
        streamingMessages,
        setStreamingMessages,
    ] = useState<ChatMessage[]>([]);

    const generation =
        useProviderGeneration({
            conversationId: 42,
            onStreamingMessagesChange:
                setStreamingMessages,
        });

    return {
        streamingMessages,
        ...generation,
    };
}

describe("useProviderGeneration", () => {
    beforeEach(() => {
        streamProviderResponseMock.mockReset();
    });

    it("keeps a completed AI response visible until it can be reconciled with the persisted message", async () => {
        streamProviderResponseMock.mockImplementation(
            async ({
                onDelta,
            }: {
                onDelta: (
                    streamedText: string
                ) => void;
            }) => {
                onDelta("Mocked LLM response");
            }
        );

        const { result } =
            renderHook(() =>
                useTestHarness()
            );

        await act(async () => {
            await result.current.generateProviders(
                ["openai"],
                100
            );
        });

        expect(
            result.current.streamingMessages
        ).toHaveLength(1);

        expect(
            result.current.streamingMessages[0]
        ).toMatchObject({
            authorType: "ai",
            authorName: "ChatGPT",
            content:
                "Mocked LLM response",
            provider: "openai",
            sourceMessageId: 100,
            isStreaming: false,
            isError: false,
        });
    });

    it("fans one human message out to three independent provider requests", async () => {
        streamProviderResponseMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useTestHarness());

        await act(async () => {
            await result.current.generateProviders(
                ["openai", "anthropic", "google"],
                100
            );
        });

        expect(streamProviderResponseMock).toHaveBeenCalledTimes(3);
        expect(streamProviderResponseMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                conversationId: 42,
                messageId: 100,
                provider: "openai",
            })
        );
        expect(streamProviderResponseMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                conversationId: 42,
                messageId: 100,
                provider: "anthropic",
            })
        );
        expect(streamProviderResponseMock).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                conversationId: 42,
                messageId: 100,
                provider: "google",
            })
        );
    });

    it("keeps a stopped partial response visible", async () => {
        streamProviderResponseMock.mockImplementation(
            ({ onDelta, signal }) =>
                new Promise<void>((_resolve, reject) => {
                    onDelta("Partial response");
                    signal.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError"))
                    );
                })
        );

        const { result } = renderHook(() => useTestHarness());

        let generation: Promise<void>;
        act(() => {
            generation = result.current.generateProviders(["openai"], 100);
        });

        await act(async () => {
            result.current.stopGeneration();
            await generation;
        });

        expect(result.current.streamingMessages).toHaveLength(1);
        expect(result.current.streamingMessages[0]).toMatchObject({
            content: "Partial response",
            isStreaming: false,
            isError: false,
            isStopped: true,
        });
    });

    it("removes a stopped response when no delta was received", async () => {
        streamProviderResponseMock.mockImplementation(
            ({ signal }) =>
                new Promise<void>((_resolve, reject) => {
                    signal.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError"))
                    );
                })
        );

        const { result } = renderHook(() => useTestHarness());
        let generation: Promise<void>;

        act(() => {
            generation = result.current.generateProviders(["openai"], 100);
        });

        await act(async () => {
            result.current.stopGeneration();
            await generation;
        });

        expect(result.current.streamingMessages).toEqual([]);
    });

    it("removes a stopped whitespace-only response", async () => {
        streamProviderResponseMock.mockImplementation(
            ({ onDelta, signal }) =>
                new Promise<void>((_resolve, reject) => {
                    onDelta("   \n");
                    signal.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError"))
                    );
                })
        );

        const { result } = renderHook(() => useTestHarness());
        let generation: Promise<void>;
        act(() => {
            generation = result.current.generateProviders(["openai"], 100);
        });
        await act(async () => {
            result.current.stopGeneration();
            await generation;
        });

        expect(result.current.streamingMessages).toEqual([]);
    });

    it("shows configuration guidance without offering transient retry", async () => {
        const ErrorType = (await import(
            "@/components/chat/composer/streamProviderResponse"
        )).StreamRequestError;
        streamProviderResponseMock.mockRejectedValue(
            new ErrorType("failed", 400, undefined, "provider_not_configured")
        );

        const { result } = renderHook(() => useTestHarness());

        await act(async () => {
            await result.current.generateProviders(["openai"], 100);
        });

        expect(result.current.streamingMessages[0]).toMatchObject({
            content: "ChatGPT is not connected. Configure it in Settings → Integrations.",
            isError: true,
            isRetryable: false,
        });
    });

    it("retains retry behavior for genuine provider failures", async () => {
        const ErrorType = (await import(
            "@/components/chat/composer/streamProviderResponse"
        )).StreamRequestError;
        streamProviderResponseMock.mockRejectedValue(
            new ErrorType("failed", 500)
        );
        vi.spyOn(console, "error").mockImplementation(() => {});

        const { result } = renderHook(() => useTestHarness());

        await act(async () => {
            await result.current.generateProviders(["openai"], 100);
        });

        expect(result.current.streamingMessages[0]).toMatchObject({
            content: "ChatGPT failed to respond. Please try again.",
            isError: true,
        });
        expect(result.current.streamingMessages[0].isRetryable).not.toBe(false);
    });
});
