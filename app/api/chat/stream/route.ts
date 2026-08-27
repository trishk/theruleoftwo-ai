import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { prepareLLMRequest } from "@/lib/llm/prepare-request";
import { streamLLM } from "@/lib/llm/registry";
import {
  checkDailyQuota,
  checkRateLimit,
} from "@/lib/security/rate-limit";
import {
  acquireGenerationLease,
  releaseGenerationLease,
} from "@/lib/security/generation-concurrency";

import { getStreamErrorCode } from "@/lib/chat-stream/stream-errors";
import { validateStreamRequest } from "@/lib/chat-stream/validate-stream-request";
import { streamValidationErrorResponse } from "@/lib/chat-stream/stream-validation-error";
import { persistStreamResponse } from "@/lib/chat-stream/persist-stream-response";

import type { LLMStreamEvent } from "@/lib/llm/types";

export async function POST(
  request: NextRequest
) {
  const user = await requireUser();

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return new Response(
      "Invalid request body.",
      {
        status: 400,
      }
    );
  }

  let validatedRequest;

  try {
    validatedRequest =
      await validateStreamRequest({
        rawBody,
        userId: user.id,
      });
  } catch (error) {
    return streamValidationErrorResponse(
      error
    );
  }

  const {
    conversationId,
    messageId,
    provider,
    ownerId,
  } = validatedRequest;

  const rateLimit =
    await checkRateLimit(
      `llm:${user.id}`
    );

  if (!rateLimit.allowed) {
    return new Response(
      "Too many requests.",
      {
        status: 429,
        headers: {
          "Retry-After": String(
            rateLimit.retryAfterSeconds
          ),
        },
      }
    );
  }

  const generationLease =
    await acquireGenerationLease(
      user.id
    );

  if (!generationLease) {
    return new Response(
      "Too many concurrent generations.",
      {
        status: 429,
        headers: {
          "Retry-After": "5",
        },
      }
    );
  }

  const generationLeaseToken =
    generationLease.token;

  let leaseReleased = false;

  async function releaseLease() {
    if (leaseReleased) {
      return;
    }

    leaseReleased = true;

    try {
      await releaseGenerationLease(
        generationLeaseToken
      );
    } catch (error) {
      console.error(
        "Failed to release generation lease:",
        error
      );
    }
  }

  let llmRequest;

  try {
    llmRequest =
      await prepareLLMRequest({
        conversationId,
        sourceMessageId: messageId,
        provider,
        currentUserId: user.id,
        currentUserName: user.name,
        ownerId,
      });
  } catch (error) {
    await releaseLease();

    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message ===
      "Provider is not configured for this conversation."
    ) {
      return new Response(
        "Provider is not configured.",
        {
          status: 400,
          headers: {
            "X-Chat-Error-Code":
              "provider_not_configured",
          },
        }
      );
    }

    console.error(
      "Failed to prepare LLM request:",
      error
    );

    return new Response(
      "Could not prepare request.",
      {
        status: 500,
      }
    );
  }

  const dailyQuota =
    await checkDailyQuota(
      user.id
    );

  if (!dailyQuota.allowed) {
    await releaseLease();

    return new Response(
      "Daily generation quota exceeded.",
      {
        status: 429,
        headers: {
          "Retry-After": String(
            dailyQuota.retryAfterSeconds
          ),
        },
      }
    );
  }

  let result;

  try {
    result = streamLLM(
      llmRequest,
      request.signal
    );
  } catch (error) {
    await releaseLease();

    console.error(
      "Failed to start LLM stream:",
      error
    );

    return new Response(
      "Could not start generation.",
      {
        status: 500,
      }
    );
  }

  let fullText = "";
  let persisted = false;

  async function persistResponse() {
    if (persisted) {
      return;
    }

    persisted = true;

    await persistStreamResponse({
      conversationId,
      provider,
      content: fullText,
    });
  }

  const encoder = new TextEncoder();

  const encodeEvent = (
    event: LLMStreamEvent
  ) =>
    encoder.encode(
      `${JSON.stringify(event)}\n`
    );

  const stream =
    new ReadableStream({
      async start(controller) {
        try {
          for await (
            const delta of
            result.textStream
          ) {
            if (
              request.signal.aborted
            ) {
              await persistResponse();
              return;
            }

            fullText += delta;

            controller.enqueue(
              encodeEvent({
                type: "delta",
                text: delta,
              })
            );
          }

          await persistResponse();

          if (
            request.signal.aborted
          ) {
            return;
          }

          controller.enqueue(
            encodeEvent({
              type: "done",
            })
          );

          controller.close();
        } catch (error) {
          if (
            request.signal.aborted
          ) {
            await persistResponse();
            return;
          }

          console.error(
            "Streaming error:",
            error
          );

          controller.enqueue(
            encodeEvent({
              type: "error",
              code:
                getStreamErrorCode(
                  error
                ),
            })
          );

          controller.close();
        } finally {
          await releaseLease();
        }
      },
    });

  return new Response(
    stream,
    {
      headers: {
        "Content-Type":
          "application/x-ndjson; charset=utf-8",
        "Cache-Control":
          "no-cache",
      },
    }
  );
}
