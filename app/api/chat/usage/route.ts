import { requireUser } from "@/lib/auth/require-user";
import { requireConversationAccess } from "@/lib/auth/require-conversation-access";
import { getConversationUsage } from "@/lib/llm/usage/conversation-usage";

export async function GET(request: Request) {
  const user = await requireUser();
  const value = new URL(request.url).searchParams.get("conversationId");
  const conversationId = value && /^\d+$/.test(value) ? Number(value) : 0;
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) return Response.json({ code: "not_found" }, { status: 404 });
  let access;
  try { access = await requireConversationAccess(conversationId, user.id); } catch { return Response.json({ code: "not_found" }, { status: 404 }); }
  if (access.ownerId !== user.id) return Response.json({ code: "not_found" }, { status: 404 });
  return Response.json(await getConversationUsage(conversationId), { headers: { "Cache-Control": "private, no-store" } });
}
