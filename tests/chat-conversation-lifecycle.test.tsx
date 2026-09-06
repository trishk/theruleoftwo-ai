// @vitest-environment jsdom

import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";

import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import "@testing-library/jest-dom/vitest";

import type { Provider } from "@/lib/llm/types";

const {
    sendHumanMessageMock,
    streamProviderResponseMock,
    refreshMock,
    broadcastMessageCreatedMock,
} = vi.hoisted(() => ({
    sendHumanMessageMock: vi.fn(),
    streamProviderResponseMock: vi.fn(),
    refreshMock: vi.fn(),
    broadcastMessageCreatedMock: vi.fn(),
}));

vi.mock(
    "@/app/actions",
    () => ({
        sendHumanMessage:
            sendHumanMessageMock,
    })
);

vi.mock(
    "next/navigation",
    () => ({
        useRouter: () => ({
            refresh: refreshMock,
        }),
    })
);

vi.mock(
    "@/components/chat/realtime/RealtimeConversationSync",
    () => ({
        useConversationRealtime: () => ({
            broadcastMessageCreated:
                broadcastMessageCreatedMock,
            broadcastConversationUpdated:
                vi.fn(),
            isReady: false,
        }),
    })
);

vi.mock(
    "@/components/chat/composer/streamProviderResponse",
    () => ({
        StreamRequestError:
            class StreamRequestError extends Error {
                status: number;
                retryAfterSeconds?: number;

                constructor(
                    message: string,
                    status: number,
                    retryAfterSeconds?: number
                ) {
                    super(message);

                    this.name =
                        "StreamRequestError";

                    this.status = status;
                    this.retryAfterSeconds =
                        retryAfterSeconds;
                }
            },

        streamProviderResponse:
            streamProviderResponseMock,
    })
);

vi.mock(
    "@/components/chat/conversation/MessageList",
    () => ({
        MessageList: ({
            messages,
            followBottomSignal,
            onReply,
        }: {
            messages: Array<{
                id: number;
                authorName: string;
                content: string;
            }>;
            followBottomSignal?: number;
            onReply?: (message: {
                id: number;
                authorName: string;
                content: string;
            }) => void;
        }) => (
            <div
                data-testid="message-list"
                data-follow-bottom-signal={
                    followBottomSignal
                }
            >
                {messages.map(
                    (message) => (
                        <div
                            key={message.id}
                            data-testid={`message-${message.id}`}
                        >
                            <span>
                                {message.authorName}
                            </span>
                            <span>
                                {message.content}
                            </span>
                            {onReply && (
                                <button
                                    type="button"
                                    aria-label={`Reply to ${message.authorName}`}
                                    onClick={() => onReply(message)}
                                >
                                    Reply
                                </button>
                            )}
                        </div>
                    )
                )}
            </div>
        ),
    })
);

vi.mock(
    "@/components/chat/composer/MessageComposer",
    () => ({
        MessageComposer: ({
            message,
            onMessageChange,
            onSubmit,
            sending,
            error,
            replyTo,
        }: {
            message: string;
            onMessageChange: (
                value: string
            ) => void;
            onSubmit: () => Promise<void>;
            sending: boolean;
            error: string | null;
            replyTo: { authorName: string } | null;
        }) => (
            <form
                data-testid="composer-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    void onSubmit();
                }}
            >
                <input
                    aria-label="message-input"
                    value={message}
                    disabled={sending}
                    onChange={(event) =>
                        onMessageChange(
                            event.target.value
                        )
                    }
                    onKeyDown={(event) => {
                        if (
                            event.key === "Enter" &&
                            !event.shiftKey
                        ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                />

                <button
                    type="submit"
                >
                    Send
                </button>
                {replyTo && <div>Replying to {replyTo.authorName}</div>}
                {error && <div>{error}</div>}
            </form>
        ),
    })
);

import { ChatConversation } from "@/components/chat/conversation/ChatConversation";

function createDeferred<T>() {
    let resolve!: (
        value: T | PromiseLike<T>
    ) => void;

    let reject!: (
        reason?: unknown
    ) => void;

    const promise =
        new Promise<T>(
            (
                resolvePromise,
                rejectPromise
            ) => {
                resolve = resolvePromise;
                reject = rejectPromise;
            }
        );

    return {
        promise,
        resolve,
        reject,
    };
}

describe(
    "ChatConversation message lifecycle",
    () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("clears draft and reply state when the conversation changes", () => {
            const conversationAMessage = {
                id: 1,
                authorType: "human" as const,
                authorName: "Alice",
                content: "Message in A",
                createdAt: new Date(),
                isOwnMessage: false,
                replyTo: null,
            };
            const rendered = render(
                <ChatConversation conversationId={1} messages={[conversationAMessage]} configuredProviders={[]} />
            );

            fireEvent.change(screen.getByLabelText("message-input"), {
                target: { value: "draft for A" },
            });
            fireEvent.click(screen.getByRole("button", { name: "Reply to Alice" }));

            rendered.rerender(
                <ChatConversation conversationId={2} messages={[]} configuredProviders={[]} />
            );

            expect(screen.getByLabelText("message-input")).toHaveValue("");
            expect(screen.queryByText("Replying to Alice")).not.toBeInTheDocument();
        });

        it("clears optimistic, sending, and submit error state across repeated conversation switches", async () => {
            const pendingSend = createDeferred<{ messageId: number; providers: Provider[] }>();
            sendHumanMessageMock.mockReturnValueOnce(pendingSend.promise);
            const rendered = render(
                <ChatConversation conversationId={1} messages={[]} configuredProviders={[]} />
            );

            fireEvent.change(screen.getByLabelText("message-input"), {
                target: { value: "optimistic from A" },
            });
            fireEvent.submit(screen.getByTestId("composer-form"));
            expect(screen.getByText("optimistic from A")).toBeInTheDocument();
            expect(screen.getByLabelText("message-input")).toBeDisabled();

            rendered.rerender(
                <ChatConversation conversationId={2} messages={[]} configuredProviders={[]} />
            );
            expect(screen.queryByText("optimistic from A")).not.toBeInTheDocument();
            expect(screen.getByLabelText("message-input")).not.toBeDisabled();
            expect(screen.getByTestId("message-list")).toHaveAttribute(
                "data-follow-bottom-signal",
                "0"
            );

            rendered.rerender(
                <ChatConversation conversationId={1} messages={[]} configuredProviders={[]} />
            );
            expect(screen.queryByText("optimistic from A")).not.toBeInTheDocument();

            streamProviderResponseMock.mockResolvedValue(undefined);

            await act(async () => {
                pendingSend.resolve({
                    messageId: 100,
                    providers: ["openai", "anthropic", "google"],
                });
                await pendingSend.promise;
            });
            await waitFor(() => {
                expect(streamProviderResponseMock).toHaveBeenCalledTimes(3);
            });
            expect(sendHumanMessageMock).toHaveBeenCalledWith(
                1,
                "optimistic from A",
                null
            );
            for (const provider of ["openai", "anthropic", "google"]) {
                expect(streamProviderResponseMock).toHaveBeenCalledWith(
                    expect.objectContaining({
                        conversationId: 1,
                        messageId: 100,
                        provider,
                    })
                );
            }
            expect(refreshMock).not.toHaveBeenCalled();
            expect(broadcastMessageCreatedMock).not.toHaveBeenCalled();
            expect(screen.queryByText("optimistic from A")).not.toBeInTheDocument();
            expect(screen.queryByText(/failed to respond/i)).not.toBeInTheDocument();
            expect(screen.queryByText("Something went wrong. Please try again.")).not.toBeInTheDocument();
        });

        it("removes streaming state and aborts active generation when the conversation changes", async () => {
            let capturedSignal: AbortSignal | undefined;
            let publishLateDelta: ((text: string) => void) | undefined;
            sendHumanMessageMock.mockResolvedValue({ messageId: 100, providers: ["openai"] });
            streamProviderResponseMock.mockImplementation(async ({ onDelta, signal }: {
                onDelta: (text: string) => void;
                signal: AbortSignal;
            }) => {
                capturedSignal = signal;
                publishLateDelta = onDelta;
                onDelta("stream from A");
                await new Promise<void>((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
                });
            });
            const rendered = render(
                <ChatConversation conversationId={1} messages={[]} configuredProviders={["openai"]} />
            );

            fireEvent.change(screen.getByLabelText("message-input"), {
                target: { value: "@chatgpt generate" },
            });
            fireEvent.submit(screen.getByTestId("composer-form"));
            await waitFor(() => expect(screen.getByText("stream from A")).toBeInTheDocument());

            rendered.rerender(
                <ChatConversation conversationId={2} messages={[]} configuredProviders={["openai"]} />
            );

            expect(screen.queryByText("stream from A")).not.toBeInTheDocument();
            expect(capturedSignal?.aborted).toBe(true);
            expect(screen.getByLabelText("message-input")).not.toBeDisabled();

            act(() => publishLateDelta?.("late mutation from A"));
            expect(screen.queryByText("late mutation from A")).not.toBeInTheDocument();
        });

        it("does not carry provider error and retry UI into another conversation", async () => {
            sendHumanMessageMock.mockResolvedValue({ messageId: 100, providers: ["openai"] });
            streamProviderResponseMock.mockImplementation(async ({ onError }: {
                onError: (event: { code: string }) => void;
            }) => {
                onError({ code: "provider_error" });
            });
            const rendered = render(
                <ChatConversation conversationId={1} messages={[]} configuredProviders={["openai"]} />
            );

            fireEvent.change(screen.getByLabelText("message-input"), {
                target: { value: "@chatgpt fail" },
            });
            fireEvent.submit(screen.getByTestId("composer-form"));
            await waitFor(() =>
                expect(screen.getByText(/failed to respond/i)).toBeInTheDocument()
            );

            rendered.rerender(
                <ChatConversation conversationId={2} messages={[]} configuredProviders={["openai"]} />
            );
            expect(screen.queryByText(/failed to respond/i)).not.toBeInTheDocument();
        });

        it("does not request bottom following for empty Enter", () => {
            render(
                <ChatConversation
                    conversationId={42}
                    messages={[]}
                    configuredProviders={[]}
                />
            );

            fireEvent.keyDown(
                screen.getByLabelText("message-input"),
                { key: "Enter" }
            );

            expect(
                screen.getByTestId("message-list")
            ).toHaveAttribute(
                "data-follow-bottom-signal",
                "0"
            );
            expect(sendHumanMessageMock).not.toHaveBeenCalled();
        });

        it("does not request bottom following for whitespace Enter", () => {
            render(
                <ChatConversation
                    conversationId={42}
                    messages={[]}
                    configuredProviders={[]}
                />
            );

            fireEvent.change(
                screen.getByLabelText("message-input"),
                { target: { value: "   " } }
            );
            fireEvent.keyDown(
                screen.getByLabelText("message-input"),
                { key: "Enter" }
            );

            expect(
                screen.getByTestId("message-list")
            ).toHaveAttribute(
                "data-follow-bottom-signal",
                "0"
            );
            expect(sendHumanMessageMock).not.toHaveBeenCalled();
        });

        it("requests bottom following for an accepted Enter submit", async () => {
            sendHumanMessageMock.mockResolvedValue({
                messageId: 100,
                providers: [],
            });

            render(
                <ChatConversation
                    conversationId={42}
                    messages={[]}
                    configuredProviders={[]}
                />
            );

            fireEvent.change(
                screen.getByLabelText("message-input"),
                { target: { value: "hello" } }
            );
            fireEvent.keyDown(
                screen.getByLabelText("message-input"),
                { key: "Enter" }
            );

            await waitFor(() => {
                expect(
                    screen.getByTestId("message-list")
                ).toHaveAttribute(
                    "data-follow-bottom-signal",
                    "1"
                );
            });
        });

        it("does not request another bottom follow for a duplicate submit while sending", async () => {
            const pendingSend = createDeferred<{
                messageId: number;
                providers: Provider[];
            }>();
            sendHumanMessageMock.mockReturnValue(pendingSend.promise);

            render(
                <ChatConversation
                    conversationId={42}
                    messages={[]}
                    configuredProviders={[]}
                />
            );

            fireEvent.change(
                screen.getByLabelText("message-input"),
                { target: { value: "hello" } }
            );
            fireEvent.submit(screen.getByTestId("composer-form"));

            await waitFor(() => {
                expect(
                    screen.getByTestId("message-list")
                ).toHaveAttribute(
                    "data-follow-bottom-signal",
                    "1"
                );
            });

            fireEvent.submit(screen.getByTestId("composer-form"));

            expect(
                screen.getByTestId("message-list")
            ).toHaveAttribute(
                "data-follow-bottom-signal",
                "1"
            );
            expect(sendHumanMessageMock).toHaveBeenCalledTimes(1);

            await act(async () => {
                pendingSend.resolve({ messageId: 100, providers: [] });
                await pendingSend.promise;
            });
        });

        it(
            "keeps completed provider responses visible while another provider is still streaming",
            async () => {
                const providerStreams =
                    new Map<
                        Provider,
                        ReturnType<
                            typeof createDeferred<void>
                        >
                    >();

                providerStreams.set(
                    "openai",
                    createDeferred<void>()
                );

                providerStreams.set(
                    "anthropic",
                    createDeferred<void>()
                );

                providerStreams.set(
                    "google",
                    createDeferred<void>()
                );

                sendHumanMessageMock.mockResolvedValue(
                    {
                        messageId: 100,
                        providers: [
                            "openai",
                            "anthropic",
                            "google",
                        ],
                    }
                );

                streamProviderResponseMock.mockImplementation(
                    async ({
                        provider,
                        onDelta,
                    }: {
                        provider: Provider;
                        onDelta: (
                            streamedText: string
                        ) => void;
                    }) => {
                        const texts: Record<
                            Provider,
                            string
                        > = {
                            openai:
                                "ChatGPT finished response",
                            anthropic:
                                "Claude finished response",
                            google:
                                "Gemini streaming response",
                        };

                        onDelta(
                            texts[provider]
                        );

                        await providerStreams.get(
                            provider
                        )!.promise;
                    }
                );

                render(
                    <ChatConversation
                        conversationId={42}
                        messages={[]}
                        configuredProviders={[
                            "openai",
                            "anthropic",
                            "google",
                        ]}
                    />
                );

                fireEvent.change(
                    screen.getByLabelText(
                        "message-input"
                    ),
                    {
                        target: {
                            value:
                                "@chatgpt @claude @gemini test",
                        },
                    }
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "Send",
                        }
                    )
                );

                await waitFor(() => {
                    expect(
                        screen.getByText(
                            "ChatGPT finished response"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByText(
                            "Claude finished response"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByText(
                            "Gemini streaming response"
                        )
                    ).toBeInTheDocument();
                });

                await act(async () => {
                    providerStreams
                        .get("openai")!
                        .resolve();

                    providerStreams
                        .get("anthropic")!
                        .resolve();

                    await Promise.resolve();
                });

                expect(
                    screen.getByText(
                        "ChatGPT finished response"
                    )
                ).toBeInTheDocument();

                expect(
                    screen.getByText(
                        "Claude finished response"
                    )
                ).toBeInTheDocument();

                expect(
                    screen.getByText(
                        "Gemini streaming response"
                    )
                ).toBeInTheDocument();

                await act(async () => {
                    providerStreams
                        .get("google")!
                        .resolve();

                    await Promise.resolve();
                });
            }
        );

        it(
            "shows the human message immediately while persistence is still pending",
            async () => {
                const pendingSend =
                    createDeferred<{
                        messageId: number;
                        providers: Provider[];
                    }>();

                sendHumanMessageMock.mockReturnValue(
                    pendingSend.promise
                );

                render(
                    <ChatConversation
                        conversationId={42}
                        messages={[]}
                        configuredProviders={[
                            "openai",
                        ]}
                    />
                );

                fireEvent.change(
                    screen.getByLabelText(
                        "message-input"
                    ),
                    {
                        target: {
                            value:
                                "@chatgpt hello",
                        },
                    }
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "Send",
                        }
                    )
                );

                expect(
                    screen.getByText(
                        "@chatgpt hello"
                    )
                ).toBeInTheDocument();

                expect(
                    sendHumanMessageMock
                ).toHaveBeenCalledTimes(
                    1
                );

                pendingSend.resolve({
                    messageId: 100,
                    providers: [
                        "openai",
                    ],
                });
            }
        );

        it(
            "keeps completed AI responses visible when persisted messages arrive while another provider is still streaming",
            async () => {
                const providerStreams =
                    new Map<
                        Provider,
                        ReturnType<
                            typeof createDeferred<void>
                        >
                    >();

                providerStreams.set(
                    "openai",
                    createDeferred<void>()
                );

                providerStreams.set(
                    "anthropic",
                    createDeferred<void>()
                );

                providerStreams.set(
                    "google",
                    createDeferred<void>()
                );

                sendHumanMessageMock.mockResolvedValue(
                    {
                        messageId: 100,
                        providers: [
                            "openai",
                            "anthropic",
                            "google",
                        ],
                    }
                );

                streamProviderResponseMock.mockImplementation(
                    async ({
                        provider,
                        onDelta,
                    }: {
                        provider: Provider;
                        onDelta: (
                            streamedText: string
                        ) => void;
                    }) => {
                        const texts: Record<
                            Provider,
                            string
                        > = {
                            openai:
                                "ChatGPT finished response",
                            anthropic:
                                "Claude finished response",
                            google:
                                "Gemini streaming response",
                        };

                        onDelta(
                            texts[provider]
                        );

                        await providerStreams.get(
                            provider
                        )!.promise;
                    }
                );

                const {
                    rerender,
                } = render(
                    <ChatConversation
                        conversationId={42}
                        messages={[]}
                        configuredProviders={[
                            "openai",
                            "anthropic",
                            "google",
                        ]}
                    />
                );

                fireEvent.change(
                    screen.getByLabelText(
                        "message-input"
                    ),
                    {
                        target: {
                            value:
                                "@chatgpt @claude @gemini test",
                        },
                    }
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "Send",
                        }
                    )
                );

                await waitFor(() => {
                    expect(
                        screen.getByText(
                            "ChatGPT finished response"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByText(
                            "Claude finished response"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByText(
                            "Gemini streaming response"
                        )
                    ).toBeInTheDocument();
                });

                await act(async () => {
                    providerStreams
                        .get("openai")!
                        .resolve();

                    providerStreams
                        .get("anthropic")!
                        .resolve();

                    await Promise.resolve();
                });

                rerender(
                    <ChatConversation
                        conversationId={42}
                        messages={[
                            {
                                id: 201,
                                authorType: "ai",
                                authorName:
                                    "ChatGPT",
                                provider:
                                    "openai",
                                content:
                                    "ChatGPT finished response",
                                createdAt:
                                    new Date(),
                                isOwnMessage: false,
                                replyTo: null,
                            },
                            {
                                id: 202,
                                authorType: "ai",
                                authorName:
                                    "Claude",
                                provider:
                                    "anthropic",
                                content:
                                    "Claude finished response",
                                createdAt:
                                    new Date(),
                                isOwnMessage: false,
                                replyTo: null,
                            },
                        ]}
                        configuredProviders={[
                            "openai",
                            "anthropic",
                            "google",
                        ]}
                    />
                );

                expect(
                    screen.getByText(
                        "ChatGPT finished response"
                    )
                ).toBeInTheDocument();

                expect(
                    screen.getByText(
                        "Claude finished response"
                    )
                ).toBeInTheDocument();

                expect(
                    screen.getByText(
                        "Gemini streaming response"
                    )
                ).toBeInTheDocument();

                await act(async () => {
                    providerStreams
                        .get("google")!
                        .resolve();

                    await Promise.resolve();
                });
            }
        );

        it(
            "reconciles optimistic and streaming messages when the sender refreshes after final generation",
            async () => {
                const pendingGeneration =
                    createDeferred<void>();

                sendHumanMessageMock.mockResolvedValue(
                    {
                        messageId: 100,
                        providers: [
                            "openai",
                        ],
                    }
                );

                streamProviderResponseMock.mockImplementation(
                    async ({
                        onDelta,
                    }: {
                        onDelta: (
                            streamedText: string
                        ) => void;
                    }) => {
                        onDelta(
                            "Persisted AI response"
                        );

                        await pendingGeneration.promise;
                    }
                );

                const rendered = render(
                    <ChatConversation
                        conversationId={42}
                        messages={[]}
                        configuredProviders={[
                            "openai",
                        ]}
                    />
                );

                refreshMock.mockImplementation(
                    () => {
                        rendered.rerender(
                            <ChatConversation
                                conversationId={42}
                                messages={[
                                    {
                                        id: 100,
                                        authorType:
                                            "human",
                                        authorName:
                                            "You",
                                        content:
                                            "@chatgpt reconcile",
                                        createdAt:
                                            new Date(),
                                        isOwnMessage: true,
                                        replyTo: null,
                                    },
                                    {
                                        id: 201,
                                        authorType:
                                            "ai",
                                        authorName:
                                            "ChatGPT",
                                        provider:
                                            "openai",
                                        content:
                                            "Persisted AI response",
                                        createdAt:
                                            new Date(),
                                        isOwnMessage: false,
                                        replyTo: null,
                                    },
                                ]}
                                configuredProviders={[
                                    "openai",
                                ]}
                            />
                        );
                    }
                );

                fireEvent.change(
                    screen.getByLabelText(
                        "message-input"
                    ),
                    {
                        target: {
                            value:
                                "@chatgpt reconcile",
                        },
                    }
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "Send",
                        }
                    )
                );

                await waitFor(() => {
                    expect(
                        screen.getByText(
                            "Persisted AI response"
                        )
                    ).toBeInTheDocument();
                });

                expect(
                    refreshMock
                ).not.toHaveBeenCalled();

                await act(async () => {
                    pendingGeneration.resolve();
                    await Promise.resolve();
                });

                await waitFor(() => {
                    expect(
                        refreshMock
                    ).toHaveBeenCalledTimes(
                        1
                    );

                    expect(
                        screen.getByTestId(
                            "message-100"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByTestId(
                            "message-201"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getAllByText(
                            "Persisted AI response"
                        )
                    ).toHaveLength(1);

                    expect(
                        screen.getAllByText(
                            "@chatgpt reconcile"
                        )
                    ).toHaveLength(1);

                    expect(
                        screen.queryAllByTestId(
                            /^message--/
                        )
                    ).toHaveLength(0);
                });
            }
        );

        it(
            "loses completed temporary AI responses if the conversation remounts before all providers finish",
            async () => {
                const providerStreams =
                    new Map<
                        Provider,
                        ReturnType<
                            typeof createDeferred<void>
                        >
                    >();

                providerStreams.set(
                    "openai",
                    createDeferred<void>()
                );

                providerStreams.set(
                    "anthropic",
                    createDeferred<void>()
                );

                providerStreams.set(
                    "google",
                    createDeferred<void>()
                );

                sendHumanMessageMock.mockResolvedValue({
                    messageId: 100,
                    providers: [
                        "openai",
                        "anthropic",
                        "google",
                    ],
                });

                streamProviderResponseMock.mockImplementation(
                    async ({
                        provider,
                        onDelta,
                    }: {
                        provider: Provider;
                        onDelta: (
                            streamedText: string
                        ) => void;
                    }) => {
                        const texts: Record<
                            Provider,
                            string
                        > = {
                            openai:
                                "ChatGPT finished response",
                            anthropic:
                                "Claude finished response",
                            google:
                                "Gemini streaming response",
                        };

                        onDelta(texts[provider]);

                        await providerStreams.get(
                            provider
                        )!.promise;
                    }
                );

                const {
                    unmount,
                } = render(
                    <ChatConversation
                        conversationId={42}
                        messages={[]}
                        configuredProviders={[
                            "openai",
                            "anthropic",
                            "google",
                        ]}
                    />
                );

                fireEvent.change(
                    screen.getByLabelText(
                        "message-input"
                    ),
                    {
                        target: {
                            value:
                                "@chatgpt @claude @gemini test",
                        },
                    }
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name: "Send",
                        }
                    )
                );

                await waitFor(() => {
                    expect(
                        screen.getByText(
                            "ChatGPT finished response"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByText(
                            "Claude finished response"
                        )
                    ).toBeInTheDocument();

                    expect(
                        screen.getByText(
                            "Gemini streaming response"
                        )
                    ).toBeInTheDocument();
                });

                await act(async () => {
                    providerStreams
                        .get("openai")!
                        .resolve();

                    providerStreams
                        .get("anthropic")!
                        .resolve();

                    await Promise.resolve();
                });

                unmount();

                render(
                    <ChatConversation
                        conversationId={42}
                        messages={[]}
                        configuredProviders={[
                            "openai",
                            "anthropic",
                            "google",
                        ]}
                    />
                );

                expect(
                    screen.queryByText(
                        "ChatGPT finished response"
                    )
                ).not.toBeInTheDocument();

                expect(
                    screen.queryByText(
                        "Claude finished response"
                    )
                ).not.toBeInTheDocument();
            }
        );
    }
);
