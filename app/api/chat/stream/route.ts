import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { prepareLLMRequest } from "@/lib/llm/prepare-request";
import { streamLLM } from "@/lib/llm/registry";
import type {
  LLMStreamErrorCode,
  LLMStreamEvent,
  Provider,
} from "@/lib/llm/types";

type Body = {
  conversationId: number;
  provider: Provider;
};

function getStreamErrorCode(
  error: unknown
): LLMStreamErrorCode {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes("credit") ||
    message.includes("quota") ||
    message.includes("billing")
  ) {
    return "insufficient_credits";
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return "rate_limit";
  }

  if (
    message.includes("api key") ||
    message.includes("unauthorized") ||
    message.includes("401")
  ) {
    return "invalid_api_key";
  }

  return "provider_error";
}

export async function POST(
  request: NextRequest
) {
  const user = await requireUser();

  const body =
    (await request.json()) as Body;

  const conversationId = Number(
    body.conversationId
  );

  const provider = body.provider;

  if (
    !Number.isInteger(conversationId) ||
    conversationId <= 0
  ) {
    return new Response(
      "Invalid conversation id.",
      {
        status: 400,
      }
    );
  }

  if (
    provider !== "openai" &&
    provider !== "anthropic" &&
    provider !== "google"
  ) {
    return new Response(
      "Invalid provider.",
      {
        status: 400,
      }
    );
  }

  const conversation =
    await requireConversationAccess(
      conversationId,
      user.id
    );

  const llmRequest =
    await prepareLLMRequest({
      conversationId,
      provider,
      currentUserId: user.id,
      currentUserName: user.name,
      ownerId: conversation.ownerId,
    });

  const result = streamLLM(llmRequest);

  let fullText = "";

  const encoder = new TextEncoder();

  const encodeEvent = (
    event: LLMStreamEvent
  ) =>
    encoder.encode(
      `${JSON.stringify(event)}\n`
    );

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of result.textStream) {
          fullText += delta;

          controller.enqueue(
            encodeEvent({
              type: "delta",
              text: delta,
            })
          );
        }

        await prisma.message.create({
          data: {
            conversationId,
            authorType: "ai",
            authorId: provider,
            content: fullText,
          },
        });

        await prisma.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            updatedAt: new Date(),
          },
        });

        controller.enqueue(
          encodeEvent({
            type: "done",
          })
        );

        controller.close();
      } catch (error) {
        console.error(
          "Streaming error:",
          error
        );

        controller.enqueue(
          encodeEvent({
            type: "error",
            code: getStreamErrorCode(
              error
            ),
          })
        );

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":
        "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}