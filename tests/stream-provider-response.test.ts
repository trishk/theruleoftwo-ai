import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  StreamRequestError,
  streamProviderResponse,
} from "@/components/chat/composer/streamProviderResponse";

function createStreamResponse(
  chunks: string[],
  options?: {
    status?: number;
    headers?: Record<string, string>;
  }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(chunk)
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: options?.status ?? 200,
    headers: options?.headers,
  });
}

describe("streamProviderResponse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accumulates delta events and reports the full streamed text", async () => {
    const fetchMock =
      vi.spyOn(globalThis, "fetch");

    fetchMock.mockResolvedValue(
      createStreamResponse([
        '{"type":"delta","text":"Hello"}\n',
        '{"type":"delta","text":" world"}\n',
        '{"type":"done"}\n',
      ])
    );

    const onDelta = vi.fn();
    const onError = vi.fn();

    await streamProviderResponse({
      conversationId: 42,
      messageId: 100,
      provider: "openai",
      signal:
        new AbortController().signal,
      onDelta,
      onError,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          conversationId: 42,
          messageId: 100,
          provider: "openai",
        }),
      })
    );

    expect(onDelta).toHaveBeenNthCalledWith(
      1,
      "Hello"
    );

    expect(onDelta).toHaveBeenNthCalledWith(
      2,
      "Hello world"
    );

    expect(onError).not.toHaveBeenCalled();
  });

  it("forwards stream error events", async () => {
    vi.spyOn(
      globalThis,
      "fetch"
    ).mockResolvedValue(
      createStreamResponse([
        '{"type":"error","code":"provider_error"}\n',
      ])
    );

    const onDelta = vi.fn();
    const onError = vi.fn();

    await streamProviderResponse({
      conversationId: 42,
      messageId: 100,
      provider: "openai",
      signal:
        new AbortController().signal,
      onDelta,
      onError,
    });

    expect(onDelta).not.toHaveBeenCalled();

    expect(onError).toHaveBeenCalledWith({
      type: "error",
      code: "provider_error",
    });
  });

  it("throws a 429 StreamRequestError with Retry-After", async () => {
    vi.spyOn(
      globalThis,
      "fetch"
    ).mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: {
          "Retry-After": "15",
        },
      })
    );

    try {
      await streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal:
          new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      });

      throw new Error(
        "Expected streamProviderResponse to throw."
      );
    } catch (error) {
      expect(
        error
      ).toBeInstanceOf(
        StreamRequestError
      );

      const streamError =
        error as StreamRequestError;

      expect(streamError.status).toBe(
        429
      );

      expect(
        streamError.retryAfterSeconds
      ).toBe(15);
    }
  });

  it("classifies an unconfigured provider separately from transient failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Provider is not configured.", {
        status: 400,
        headers: { "X-Chat-Error-Code": "provider_not_configured" },
      })
    );

    await expect(
      streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal: new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "provider_not_configured",
    });
  });

  it("does not infer provider configuration errors from response text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Provider is not configured.", { status: 400 })
    );

    await expect(
      streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal: new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      })
    ).rejects.toMatchObject({ status: 400, code: undefined });
  });

  it("keeps genuine provider failures classified as retryable failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Could not start generation.", { status: 500 })
    );

    await expect(
      streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal: new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      })
    ).rejects.toMatchObject({ status: 500, code: undefined });
  });

  it("uses a 60 second fallback when Retry-After is missing", async () => {
    vi.spyOn(
      globalThis,
      "fetch"
    ).mockResolvedValue(
      new Response(null, {
        status: 429,
      })
    );

    try {
      await streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal:
          new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      });

      throw new Error(
        "Expected streamProviderResponse to throw."
      );
    } catch (error) {
      const streamError =
        error as StreamRequestError;

      expect(streamError.status).toBe(
        429
      );

      expect(
        streamError.retryAfterSeconds
      ).toBe(60);
    }
  });

  it("uses a 60 second fallback when Retry-After is invalid", async () => {
    vi.spyOn(
      globalThis,
      "fetch"
    ).mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: {
          "Retry-After": "invalid",
        },
      })
    );

    try {
      await streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal:
          new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      });

      throw new Error(
        "Expected streamProviderResponse to throw."
      );
    } catch (error) {
      const streamError =
        error as StreamRequestError;

      expect(
        streamError.retryAfterSeconds
      ).toBe(60);
    }
  });

  it("throws when a successful response has no body", async () => {
    vi.spyOn(
      globalThis,
      "fetch"
    ).mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    } as Response);

    await expect(
      streamProviderResponse({
        conversationId: 42,
        messageId: 100,
        provider: "openai",
        signal:
          new AbortController().signal,
        onDelta: vi.fn(),
        onError: vi.fn(),
      })
    ).rejects.toMatchObject({
      name: "StreamRequestError",
      status: 200,
      message:
        "Streaming response has no body.",
    });
  });
});
