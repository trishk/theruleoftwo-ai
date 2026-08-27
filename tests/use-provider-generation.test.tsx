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

            constructor(
                message: string,
                status: number,
                retryAfterSeconds?: number
            ) {
                super(message);
                this.status = status;
                this.retryAfterSeconds =
                    retryAfterSeconds;
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
});