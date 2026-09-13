import {
  authenticatePersonalAgent,
  PersonalAgentAuthenticationError,
} from "@/lib/personal-agent/auth";
import { updatePersonalAgentStatus } from "@/lib/personal-agent/presence";
import { parsePersonalAgentEvent } from "@/lib/personal-agent/protocol";
import { readLimitedJson } from "@/lib/personal-agent/request";
import { applyPersonalGenerationEvent } from "@/lib/personal-agent/generation-jobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let agent;
  try {
    agent = await authenticatePersonalAgent(request);
  } catch (error) {
    if (error instanceof PersonalAgentAuthenticationError) {
      return Response.json({ code: "unauthorized" }, { status: 401 });
    }
    throw error;
  }

  try {
    const event = parsePersonalAgentEvent(await readLimitedJson(request));
    if (event.type === "hello" || event.type === "heartbeat") {
      const status = event.type === "hello" ? event.adapter.status : event.adapterStatus;
      const updated = await updatePersonalAgentStatus(agent.id, status);
      if (updated.count !== 1) return Response.json({ code: "unauthorized" }, { status: 401 });
    } else {
      await applyPersonalGenerationEvent(agent.id, event);
    }
    return Response.json({ protocolVersion: 1, accepted: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    const status = code === "request_too_large" ? 413 : code === "job_not_found" ? 404 : code === "invalid_transition" || code === "conversation_id_mismatch" ? 409 : 400;
    return Response.json({ code: status === 413 ? code : code === "job_not_found" || status === 409 ? code : "invalid_protocol_payload" }, { status });
  }
}
