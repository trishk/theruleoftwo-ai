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
      }
    );

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
      expect(await response.text()).toBe("Provider is not configured.");
    });
  }
);
