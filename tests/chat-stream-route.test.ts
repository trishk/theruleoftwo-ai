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
}));

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
          persistStreamResponseMock
        ).toHaveBeenCalledWith({
          conversationId: 1,
          provider: "openai",
          content: "Hello world",
        });

        expect(
          checkDailyQuotaMock
        ).toHaveBeenCalledWith(
          "user-1"
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
          "user-1"
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

        expect(
          await response.text()
        ).toBe(
          "Daily generation quota exceeded."
        );

        expect(
          prepareLLMRequestMock
        ).toHaveBeenCalled();

        expect(
          checkDailyQuotaMock
        ).toHaveBeenCalledWith(
          "user-1"
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

    it("returns a machine-readable code when the provider is not configured", async () => {
      prepareLLMRequestMock.mockRejectedValue(
        new Error("Provider is not configured for this conversation.")
      );

      const response = await POST(createRequest() as never);

      expect(response.status).toBe(400);
      expect(response.headers.get("X-Chat-Error-Code")).toBe(
        "provider_not_configured"
      );
      expect(await response.text()).toBe("Provider is not configured.");
    });
  }
);
