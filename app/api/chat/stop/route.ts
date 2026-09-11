import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { stopAttempt } from "@/lib/chat-stream/generation-lifecycle";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const user = await requireUser();
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ code: "invalid_request" }, { status: 400 }); }
  const attemptId = typeof body === "object" && body !== null ? (body as Record<string, unknown>).attemptId : null;
  if (typeof attemptId !== "string" || !attemptId) return Response.json({ code: "invalid_attempt" }, { status: 400 });

  const attempt = await prisma.aiGenerationAttempt.findUnique({
    where: { id: attemptId },
    select: {
      requesterId: true,
      generation: { select: { conversationId: true, sourceMessage: { select: { authorType: true, authorId: true } } } },
    },
  });
  if (!attempt) return Response.json({ code: "attempt_not_found" }, { status: 404 });
  let access;
  try { access = await requireConversationAccess(attempt.generation.conversationId, user.id); }
  catch { return Response.json({ code: "attempt_not_found" }, { status: 404 }); }
  if (access.ownerId !== user.id && !access.allowMemberAiUsage) return Response.json({ code: "member_ai_usage_not_allowed" }, { status: 403 });
  if (attempt.requesterId !== user.id || attempt.generation.sourceMessage.authorType !== "human" || attempt.generation.sourceMessage.authorId !== user.id) {
    return Response.json({ code: "attempt_not_found" }, { status: 404 });
  }
  const status = await stopAttempt(attemptId);
  if (!status) return Response.json({ code: "attempt_not_found" }, { status: 404 });
  return Response.json({ outcome: status === "stopped" ? "stopped" : "unchanged", status, attemptId });
}
