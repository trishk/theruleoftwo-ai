import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  requireUserMock,
  validateStreamRequestMock,
  streamValidationErrorResponseMock,
  checkRateLimitMock,
  checkDailyQuotaMock,
  acquireGenerationLeaseMock,
  releaseGenerationLeaseMock,
  prepareLLMRequestMock,
  streamLLMMock,
  persistStreamResponseMock,
  getStreamErrorCodeMock,
  recoverStaleGenerationsMock,
  reserveGenerationMock,
  failAttemptMock,
  startAttemptMock,
  markProviderInvokedMock,
  flushAttemptMock,
  completeAttemptMock,
  getAttemptStatusMock,
  heartbeatAttemptMock,
  persistAttemptTelemetryMock,
  observeTelemetryMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  validateStreamRequestMock: vi.fn(),
  streamValidationErrorResponseMock:
    vi.fn(),
  checkRateLimitMock: vi.fn(),
  checkDailyQuotaMock: vi.fn(),
  acquireGenerationLeaseMock:
    vi.fn(),
  releaseGenerationLeaseMock:
    vi.fn(),
  prepareLLMRequestMock: vi.fn(),
  streamLLMMock: vi.fn(),
  persistStreamResponseMock:
    vi.fn(),
  getStreamErrorCodeMock:
    vi.fn(),
  recoverStaleGenerationsMock: vi.fn(),
  reserveGenerationMock: vi.fn(),
  failAttemptMock: vi.fn(),
  startAttemptMock: vi.fn(),
  markProviderInvokedMock: vi.fn(),
  flushAttemptMock: vi.fn(),
  completeAttemptMock: vi.fn(),
  getAttemptStatusMock: vi.fn(),
  heartbeatAttemptMock: vi.fn(),
  persistAttemptTelemetryMock: vi.fn(),
  observeTelemetryMock: vi.fn(),
}));

vi.mock("@/lib/chat-stream/generation-lifecycle", () => ({
  recoverStaleGenerations: recoverStaleGenerationsMock,
  reserveGeneration: reserveGenerationMock,
  failAttempt: failAttemptMock,
  startAttempt: startAttemptMock,
  markProviderInvoked: markProviderInvokedMock,
  flushAttempt: flushAttemptMock,
  completeAttempt: completeAttemptMock,
  getAttemptStatus: getAttemptStatusMock,
  heartbeatAttempt: heartbeatAttemptMock,
  persistAttemptTelemetry: persistAttemptTelemetryMock,
}));

vi.mock("@/lib/llm/usage/capture", () => ({ observeTelemetry: observeTelemetryMock }));

vi.mock(
  "@/lib/auth/require-user",
  () => ({
    requireUser: requireUserMock,
  })
);

vi.mock(
  "@/lib/chat-stream/validate-stream-request",
  () => ({
    validateStreamRequest:
      validateStreamRequestMock,
  })
);

vi.mock(
  "@/lib/chat-stream/stream-validation-error",
  () => ({
    streamValidationErrorResponse:
      streamValidationErrorResponseMock,
  })
);

vi.mock(
  "@/lib/security/rate-limit",
  () => ({
    checkRateLimit:
      checkRateLimitMock,
    checkDailyQuota:
      checkDailyQuotaMock,
  })
);

vi.mock(
  "@/lib/security/generation-concurrency",
  () => ({
    acquireGenerationLease:
      acquireGenerationLeaseMock,
    releaseGenerationLease:
      releaseGenerationLeaseMock,
    renewGenerationLease: vi.fn().mockResolvedValue(true),
  })
);

vi.mock(
  "@/lib/llm/prepare-request",
  () => ({
    prepareLLMRequest:
      prepareLLMRequestMock,
  })
);

vi.mock(
  "@/lib/llm/registry",
  () => ({
    streamLLM:
      streamLLMMock,
  })
);

vi.mock(
  "@/lib/chat-stream/persist-stream-response",
  () => ({
    persistStreamResponse:
      persistStreamResponseMock,
  })
);

vi.mock(
  "@/lib/chat-stream/stream-errors",
  () => ({
    getStreamErrorCode:
      getStreamErrorCodeMock,
  })
);

import { POST } from "@/app/api/chat/stream/route";

function createRequest() {
  return new Request(
    "http://localhost/api/chat/stream",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        conversationId: 1,
        messageId: 10,
        provider: "openai",
      }),
    }
  );
}

function createTextStream(
  chunks: string[]
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe(
  "chat stream route",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      requireUserMock.mockResolvedValue({
        id: "user-1",
        name: "Tudor",
      });

      validateStreamRequestMock.mockResolvedValue({
        conversationId: 1,
        messageId: 10,
        provider: "openai",
        ownerId: "owner-1",
      });

      checkRateLimitMock.mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      });

      checkDailyQuotaMock.mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      });

      acquireGenerationLeaseMock.mockResolvedValue({
        token: "lease-1",
        slot: 1,
      });

      releaseGenerationLeaseMock.mockResolvedValue(
        undefined
      );

      prepareLLMRequestMock.mockResolvedValue({
        provider: "openai",
        model: "test-model",
        apiKey: "test-key",
        instructions:
          "test instructions",
        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],
      });

      persistStreamResponseMock.mockResolvedValue(
        undefined
      );

      getStreamErrorCodeMock.mockReturnValue(
        "provider_error"
      );
      recoverStaleGenerationsMock.mockResolvedValue(false);
      reserveGenerationMock.mockResolvedValue({ created: true, generationId: "generation-1", attemptId: "attempt-1", status: "pending", outputMessageId: null, output: null });
      failAttemptMock.mockResolvedValue({ count: 1 });
      startAttemptMock.mockResolvedValue(999);
      markProviderInvokedMock.mockResolvedValue({ count: 1 });
      flushAttemptMock.mockResolvedValue(true);
      completeAttemptMock.mockResolvedValue(true);
      getAttemptStatusMock.mockResolvedValue({ status: "streaming" });
      heartbeatAttemptMock.mockResolvedValue(true);
      persistAttemptTelemetryMock.mockResolvedValue(true);
      observeTelemetryMock.mockReturnValue(vi.fn().mockResolvedValue({ usage: { inputTokens: 3n, inputTokensNoCache: 2n, inputTokensCacheRead: 1n, inputTokensCacheWrite: 0n, outputTokens: 2n, outputTextTokens: 1n, outputReasoningTokens: 1n, totalTokens: 5n }, effectiveModel: "effective-model" }));
    });

    it(
      "releases the lease after successful streaming",
      async () => {
        streamLLMMock.mockReturnValue({
          textStream:
            createTextStream([
              "Hello",
              " world",
            ]),
        });

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(200);

        const body =
          await response.text();

        expect(body).toContain(
          '"type":"delta"'
        );

        expect(body).toContain(
          '"type":"done"'
        );

        expect(
          flushAttemptMock
        ).toHaveBeenCalledWith(
          "attempt-1",
          "Hello world"
        );

        expect(checkRateLimitMock).toHaveBeenCalledWith(
          "llm:user-1"
        );

        expect(
          acquireGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "owner-1"
        );

        expect(
          checkDailyQuotaMock
        ).toHaveBeenCalledWith(
          "owner-1"
        );

        expect(
          checkRateLimitMock.mock.invocationCallOrder[0]
        ).toBeLessThan(
          acquireGenerationLeaseMock.mock.invocationCallOrder[0]
        );

        expect(
          acquireGenerationLeaseMock.mock.invocationCallOrder[0]
        ).toBeLessThan(
          prepareLLMRequestMock.mock.invocationCallOrder[0]
        );

        expect(
          prepareLLMRequestMock.mock.invocationCallOrder[0]
        ).toBeLessThan(
          checkDailyQuotaMock.mock.invocationCallOrder[0]
        );

        expect(
          checkDailyQuotaMock.mock.invocationCallOrder[0]
        ).toBeLessThan(
          streamLLMMock.mock.invocationCallOrder[0]
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "lease-1"
        );
        expect(markProviderInvokedMock).toHaveBeenCalledWith("attempt-1", { provider: "openai", requestedModel: "test-model" });
        expect(persistAttemptTelemetryMock).toHaveBeenCalledWith({
          attemptId: "attempt-1", provider: "openai", requestedModel: "test-model",
          capture: { usage: { inputTokens: 3n, inputTokensNoCache: 2n, inputTokensCacheRead: 1n, inputTokensCacheWrite: 0n, outputTokens: 2n, outputTextTokens: 1n, outputReasoningTokens: 1n, totalTokens: 5n }, effectiveModel: "effective-model" },
        });
      }
    );

    it("keeps a completed response successful when telemetry persistence fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      persistAttemptTelemetryMock.mockRejectedValue(new Error("temporary sqlite failure"));
      streamLLMMock.mockReturnValue({ textStream: createTextStream(["ok"]) });
      const response = await POST(createRequest() as never);
      const body = await response.text();
      expect(body).toContain('"type":"done"');
      expect(body).not.toContain('"type":"error"');
      expect(completeAttemptMock).toHaveBeenCalledTimes(1);
      expect(failAttemptMock).not.toHaveBeenCalled();
      expect(streamLLMMock).toHaveBeenCalledTimes(1);
      expect(persistAttemptTelemetryMock).toHaveBeenCalledWith(expect.objectContaining({ attemptId: "attempt-1", provider: "openai", requestedModel: "test-model" }));
    });

    it("charges an owner request to the owner's shared budget", async () => {
      requireUserMock.mockResolvedValue({
        id: "owner-1",
        name: "Owner",
      });

      streamLLMMock.mockReturnValue({
        textStream: createTextStream(["ok"]),
      });

      const response = await POST(createRequest() as never);
      await response.text();

      expect(checkRateLimitMock).toHaveBeenCalledWith("llm:owner-1");
      expect(acquireGenerationLeaseMock).toHaveBeenCalledWith("owner-1");
      expect(checkDailyQuotaMock).toHaveBeenCalledWith("owner-1");
    });

    it("charges a member and guest to the same owner quota and concurrency pool", async () => {
      streamLLMMock.mockReturnValue({
        textStream: createTextStream(["ok"]),
      });

      requireUserMock.mockResolvedValueOnce({
        id: "member-1",
        name: "Member One",
      });
      const firstResponse = await POST(createRequest() as never);
      await firstResponse.text();

      requireUserMock.mockResolvedValueOnce({
        id: "guest-1",
        name: "Guest One",
        isGuest: true,
      });
      const secondResponse = await POST(createRequest() as never);
      await secondResponse.text();

      expect(checkRateLimitMock).toHaveBeenNthCalledWith(1, "llm:member-1");
      expect(checkRateLimitMock).toHaveBeenNthCalledWith(2, "llm:guest-1");
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(1, "owner-1");
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(2, "owner-1");
      expect(acquireGenerationLeaseMock).toHaveBeenNthCalledWith(1, "owner-1");
      expect(acquireGenerationLeaseMock).toHaveBeenNthCalledWith(2, "owner-1");
    });

    it("keeps distinct guest requester limits while charging the same owner", async () => {
      streamLLMMock.mockReturnValue({
        textStream: createTextStream(["ok"]),
      });
      requireUserMock
        .mockResolvedValueOnce({ id: "guest-a", name: "Guest A", isGuest: true })
        .mockResolvedValueOnce({ id: "guest-b", name: "Guest B", isGuest: true });

      const firstResponse = await POST(createRequest() as never);
      await firstResponse.text();
      const secondResponse = await POST(createRequest() as never);
      await secondResponse.text();

      expect(checkRateLimitMock).toHaveBeenNthCalledWith(1, "llm:guest-a");
      expect(checkRateLimitMock).toHaveBeenNthCalledWith(2, "llm:guest-b");
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(1, "owner-1");
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(2, "owner-1");
      expect(acquireGenerationLeaseMock).toHaveBeenNthCalledWith(1, "owner-1");
      expect(acquireGenerationLeaseMock).toHaveBeenNthCalledWith(2, "owner-1");
    });

    it("accounts three accepted provider requests as three owner quota units and leases", async () => {
      streamLLMMock.mockReturnValue({
        textStream: createTextStream(["ok"]),
      });
      acquireGenerationLeaseMock
        .mockResolvedValueOnce({ token: "lease-openai", slot: 1 })
        .mockResolvedValueOnce({ token: "lease-anthropic", slot: 2 })
        .mockResolvedValueOnce({ token: "lease-google", slot: 3 });

      for (const provider of ["openai", "anthropic", "google"]) {
        validateStreamRequestMock.mockResolvedValueOnce({
          conversationId: 1,
          messageId: 10,
          provider,
          ownerId: "owner-1",
        });
        const response = await POST(createRequest() as never);
        await response.text();
      }

      expect(checkDailyQuotaMock).toHaveBeenCalledTimes(3);
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(1, "owner-1");
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(2, "owner-1");
      expect(checkDailyQuotaMock).toHaveBeenNthCalledWith(3, "owner-1");
      expect(acquireGenerationLeaseMock).toHaveBeenCalledTimes(3);
      expect(releaseGenerationLeaseMock).toHaveBeenCalledWith("lease-openai");
      expect(releaseGenerationLeaseMock).toHaveBeenCalledWith("lease-anthropic");
      expect(releaseGenerationLeaseMock).toHaveBeenCalledWith("lease-google");
    });

    it("does not invoke a provider when conversation access validation fails", async () => {
      validateStreamRequestMock.mockRejectedValue(
        new Error("CONVERSATION_NOT_FOUND")
      );
      streamValidationErrorResponseMock.mockReturnValue(
        new Response("Conversation not found.", { status: 404 })
      );

      const response = await POST(createRequest() as never);

      expect(response.status).toBe(404);
      expect(checkRateLimitMock).not.toHaveBeenCalled();
      expect(acquireGenerationLeaseMock).not.toHaveBeenCalled();
      expect(prepareLLMRequestMock).not.toHaveBeenCalled();
      expect(checkDailyQuotaMock).not.toHaveBeenCalled();
      expect(streamLLMMock).not.toHaveBeenCalled();
    });

    it("returns 403 before rate limits, quota, leases, decrypt, or provider access", async () => {
      validateStreamRequestMock.mockRejectedValue(
        new Error("MEMBER_AI_USAGE_NOT_ALLOWED")
      );
      streamValidationErrorResponseMock.mockReturnValue(
        new Response("The conversation owner has not enabled shared AI usage.", {
          status: 403,
        })
      );

      const response = await POST(createRequest() as never);

      expect(response.status).toBe(403);
      expect(checkRateLimitMock).not.toHaveBeenCalled();
      expect(acquireGenerationLeaseMock).not.toHaveBeenCalled();
      expect(prepareLLMRequestMock).not.toHaveBeenCalled();
      expect(checkDailyQuotaMock).not.toHaveBeenCalled();
      expect(streamLLMMock).not.toHaveBeenCalled();
    });

    it("does not consume owner quota when authentication fails", async () => {
      requireUserMock.mockRejectedValue(
        new Error("Unauthorized")
      );

      await expect(
        POST(createRequest() as never)
      ).rejects.toThrow("Unauthorized");

      expect(validateStreamRequestMock).not.toHaveBeenCalled();
      expect(checkRateLimitMock).not.toHaveBeenCalled();
      expect(acquireGenerationLeaseMock).not.toHaveBeenCalled();
      expect(prepareLLMRequestMock).not.toHaveBeenCalled();
      expect(checkDailyQuotaMock).not.toHaveBeenCalled();
      expect(streamLLMMock).not.toHaveBeenCalled();
    });

    it(
      "releases the lease when preparing the request fails",
      async () => {
        prepareLLMRequestMock.mockRejectedValue(
          new Error(
            "prepare failed"
          )
        );

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(500);

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "lease-1"
        );

        expect(
          checkDailyQuotaMock
        ).not.toHaveBeenCalled();

        expect(
          streamLLMMock
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "releases the lease when stream startup fails",
      async () => {
        streamLLMMock.mockImplementation(
          () => {
            throw new Error(
              "stream startup failed"
            );
          }
        );

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(500);

        expect(
          checkDailyQuotaMock
        ).toHaveBeenCalledWith(
          "owner-1"
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "lease-1"
        );
      }
    );

    it("completes output when usage is rejected after provider success", async () => {
      observeTelemetryMock.mockReturnValue(vi.fn().mockResolvedValue({ unavailableReason: "usage_rejected" }));
      streamLLMMock.mockReturnValue({ textStream: createTextStream(["complete output"]) });
      const response = await POST(createRequest() as never);
      const body = await response.text();
      expect(flushAttemptMock).toHaveBeenLastCalledWith("attempt-1", "complete output");
      expect(completeAttemptMock).toHaveBeenCalledTimes(1);
      expect(persistAttemptTelemetryMock).toHaveBeenCalledWith(expect.objectContaining({ capture: { unavailableReason: "usage_rejected" } }));
      expect(failAttemptMock).not.toHaveBeenCalled();
      expect(body).toContain('"type":"done"');
      expect(body).not.toContain('"type":"error"');
      expect(streamLLMMock).toHaveBeenCalledTimes(1);
    });

    it("completes output when telemetry reaches its controlled deadline", async () => {
      vi.useFakeTimers();
      const usage = createDeferred<never>();
      const finalStep = createDeferred<never>();
      try {
        observeTelemetryMock.mockImplementation((result: { usage: Promise<never>; finalStep: Promise<never> }) => {
          void result.usage.catch(() => undefined);
          void result.finalStep.catch(() => undefined);
          return () => new Promise<{ unavailableReason: string }>((resolve) => {
            const timer = setTimeout(() => { clearTimeout(timer); resolve({ unavailableReason: "usage_timeout" }); }, 25);
          });
        });
        streamLLMMock.mockReturnValue({ textStream: createTextStream(["complete output"]), usage: usage.promise, finalStep: finalStep.promise });
        const response = await POST(createRequest() as never);
        const bodyPromise = response.text();
        await vi.advanceTimersByTimeAsync(25);
        const body = await bodyPromise;
        expect(vi.getTimerCount()).toBe(0);
        expect(completeAttemptMock).toHaveBeenCalledTimes(1);
        expect(persistAttemptTelemetryMock).toHaveBeenCalledWith(expect.objectContaining({ capture: { unavailableReason: "usage_timeout" } }));
        expect(failAttemptMock).not.toHaveBeenCalled();
        expect(body).toContain('"type":"done"');
        expect(body).not.toContain('"type":"error"');
        expect(streamLLMMock).toHaveBeenCalledTimes(1);
        usage.reject(new Error("late usage rejection"));
        finalStep.reject(new Error("late step rejection"));
        await Promise.resolve();
      } finally {
        vi.useRealTimers();
      }
    });

    it(
      "returns 429 without releasing when no lease was acquired",
      async () => {
        acquireGenerationLeaseMock.mockResolvedValue(
          null
        );

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(429);

        expect(
          response.headers.get(
            "Retry-After"
          )
        ).toBe("5");

        expect(
          releaseGenerationLeaseMock
        ).not.toHaveBeenCalled();

        expect(
          prepareLLMRequestMock
        ).not.toHaveBeenCalled();

        expect(
          checkDailyQuotaMock
        ).not.toHaveBeenCalled();

        expect(
          streamLLMMock
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "does not acquire a lease when rate limited",
      async () => {
        checkRateLimitMock.mockResolvedValue({
          allowed: false,
          retryAfterSeconds: 23,
        });

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(429);

        expect(
          response.headers.get(
            "Retry-After"
          )
        ).toBe("23");

        expect(
          acquireGenerationLeaseMock
        ).not.toHaveBeenCalled();

        expect(
          prepareLLMRequestMock
        ).not.toHaveBeenCalled();

        expect(
          checkDailyQuotaMock
        ).not.toHaveBeenCalled();

        expect(
          releaseGenerationLeaseMock
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "releases the lease when the provider is not configured",
      async () => {
        prepareLLMRequestMock.mockRejectedValue(
          new Error(
            "Provider is not configured for this conversation."
          )
        );

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(400);

        expect(
          checkDailyQuotaMock
        ).not.toHaveBeenCalled();

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "lease-1"
        );

        expect(
          streamLLMMock
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "releases the lease and does not start streaming when the daily quota is exceeded",
      async () => {
        checkDailyQuotaMock.mockResolvedValue({
          allowed: false,
          retryAfterSeconds: 3600,
        });

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(429);

        expect(
          response.headers.get(
            "Retry-After"
          )
        ).toBe("3600");

        expect(await response.json()).toMatchObject({
          code: "quota_exceeded",
          retryAfterSeconds: 3600,
        });

        expect(
          prepareLLMRequestMock
        ).toHaveBeenCalled();

        expect(
          checkDailyQuotaMock
        ).toHaveBeenCalledWith(
          "owner-1"
        );

        expect(
          streamLLMMock
        ).not.toHaveBeenCalled();

        expect(
          persistStreamResponseMock
        ).not.toHaveBeenCalled();

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "lease-1"
        );
      }
    );

    it(
      "persists partial output and releases the lease when streaming fails",
      async () => {
        streamLLMMock.mockReturnValue({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield "partial";

              throw new Error(
                "provider exploded"
              );
            },
          },
        });

        const response =
          await POST(
            createRequest() as never
          );

        expect(
          response.status
        ).toBe(200);

        const body =
          await response.text();

        expect(body).toContain(
          '"type":"delta"'
        );

        expect(body).toContain(
          '"type":"error"'
        );

        expect(
          persistStreamResponseMock
        ).not.toHaveBeenCalled();

        expect(
          checkDailyQuotaMock
        ).toHaveBeenCalledWith(
          "owner-1"
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          releaseGenerationLeaseMock
        ).toHaveBeenCalledWith(
          "lease-1"
        );
      }
    );

    it("treats a manual retry as a fresh gated and charged request", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      acquireGenerationLeaseMock
        .mockResolvedValueOnce({ token: "lease-first", slot: 1 })
        .mockResolvedValueOnce({ token: "lease-retry", slot: 1 });
      streamLLMMock
        .mockReturnValueOnce({
          textStream: {
            async *[Symbol.asyncIterator]() {
              throw new Error("provider failed");
            },
          },
        })
        .mockReturnValueOnce({ textStream: createTextStream(["retry ok"]) });

      const firstResponse = await POST(createRequest() as never);
      await firstResponse.text();
      const retryResponse = await POST(createRequest() as never);
      await retryResponse.text();

      expect(checkRateLimitMock).toHaveBeenCalledTimes(2);
      expect(acquireGenerationLeaseMock).toHaveBeenCalledTimes(2);
      expect(prepareLLMRequestMock).toHaveBeenCalledTimes(2);
      expect(checkDailyQuotaMock).toHaveBeenCalledTimes(2);
      expect(streamLLMMock).toHaveBeenCalledTimes(2);
      expect(releaseGenerationLeaseMock).toHaveBeenNthCalledWith(
        1,
        "lease-first"
      );
      expect(releaseGenerationLeaseMock).toHaveBeenNthCalledWith(
        2,
        "lease-retry"
      );
    });

    it("returns a machine-readable code when the provider is not configured", async () => {
      prepareLLMRequestMock.mockRejectedValue(
        new Error("Provider is not configured for this conversation.")
      );

      const response = await POST(createRequest() as never);

      expect(response.status).toBe(400);
      expect(response.headers.get("X-Chat-Error-Code")).toBe(
        "provider_not_configured"
      );
      expect(await response.json()).toMatchObject({
        code: "provider_not_configured",
      });
    });

    it.each(["pending", "streaming"])("returns a 202 duplicate for %s before side effects", async (status) => {
      reserveGenerationMock.mockResolvedValue({ created: false, generationId: "generation-1", attemptId: "attempt-1", status, outputMessageId: status === "streaming" ? 999 : null, output: null });
      const response = await POST(createRequest() as never);
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ outcome: "duplicate", status, attemptId: "attempt-1" });
      expect(checkRateLimitMock).not.toHaveBeenCalled();
      expect(acquireGenerationLeaseMock).not.toHaveBeenCalled();
      expect(prepareLLMRequestMock).not.toHaveBeenCalled();
      expect(checkDailyQuotaMock).not.toHaveBeenCalled();
      expect(streamLLMMock).not.toHaveBeenCalled();
    });

    it("replays a completed attempt without side effects", async () => {
      reserveGenerationMock.mockResolvedValue({ created: false, generationId: "generation-1", attemptId: "attempt-1", status: "completed", outputMessageId: 999, output: "saved" });
      const response = await POST(createRequest() as never);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ outcome: "replayed", output: "saved" });
      expect(checkRateLimitMock).not.toHaveBeenCalled();
      expect(streamLLMMock).not.toHaveBeenCalled();
    });

    it("polls and aborts a stopped provider that emits no chunks", async () => {
      vi.useFakeTimers();
      try {
        getAttemptStatusMock
          .mockResolvedValueOnce({ status: "streaming" })
          .mockResolvedValueOnce({ status: "stopped" })
          .mockResolvedValue({ status: "stopped" });
        streamLLMMock.mockImplementation((_request, signal: AbortSignal) => ({
          textStream: {
            [Symbol.asyncIterator]() {
              return {
                next: () => new Promise<IteratorResult<string>>((_resolve, reject) => {
                  signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
                }),
              };
            },
          },
        }));

        const response = await POST(createRequest() as never);
        const bodyPromise = response.text();
        await vi.advanceTimersByTimeAsync(3_000);
        expect(getAttemptStatusMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(3_000);
        const body = await bodyPromise;

        expect(body).not.toContain('"type":"delta"');
        expect(body).not.toContain('"type":"done"');
        expect(body).toContain('"type":"error"');
        expect(completeAttemptMock).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("force-flushes a sub-threshold server snapshot after stop without another provider call or terminal transition", async () => {
      vi.useFakeTimers();
      try {
        const partial = "visible partial";
        getAttemptStatusMock.mockResolvedValue({ status: "stopped" });
        streamLLMMock.mockImplementation((_request, signal: AbortSignal) => ({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield partial;
              await new Promise<void>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
              });
            },
          },
        }));

        const response = await POST(createRequest() as never);
        const bodyPromise = response.text();
        await vi.advanceTimersByTimeAsync(3_000);
        const body = await bodyPromise;

        expect(body).toContain(`"type":"delta","text":"${partial}"`);
        expect(flushAttemptMock).toHaveBeenCalledTimes(1);
        expect(flushAttemptMock).toHaveBeenCalledWith("attempt-1", partial);
        expect(streamLLMMock).toHaveBeenCalledTimes(1);
        expect(completeAttemptMock).not.toHaveBeenCalled();
        expect(failAttemptMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("force-flushes the uncheckpointed suffix after stop", async () => {
      vi.useFakeTimers();
      try {
        const checkpoint = "x".repeat(2 * 1024);
        const suffix = " final suffix";
        getAttemptStatusMock.mockResolvedValue({ status: "stopped" });
        streamLLMMock.mockImplementation((_request, signal: AbortSignal) => ({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield checkpoint;
              yield suffix;
              await new Promise<void>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
              });
            },
          },
        }));

        const response = await POST(createRequest() as never);
        const bodyPromise = response.text();
        await vi.advanceTimersByTimeAsync(3_000);
        await bodyPromise;

        expect(flushAttemptMock).toHaveBeenCalledTimes(2);
        expect(flushAttemptMock).toHaveBeenNthCalledWith(1, "attempt-1", checkpoint);
        expect(flushAttemptMock).toHaveBeenNthCalledWith(2, "attempt-1", checkpoint + suffix);
        expect(completeAttemptMock).not.toHaveBeenCalled();
        expect(failAttemptMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  }
);
