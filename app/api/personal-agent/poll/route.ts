import {
  authenticatePersonalAgent,
  PersonalAgentAuthenticationError,
} from "@/lib/personal-agent/auth";
import { touchPersonalAgent } from "@/lib/personal-agent/presence";
import {
  PERSONAL_AGENT_PROTOCOL_VERSION,
  parsePersonalAgentPollRequest,
} from "@/lib/personal-agent/protocol";
import { readLimitedJson } from "@/lib/personal-agent/request";

export const dynamic = "force-dynamic";
const DEFAULT_WAIT_MS = 20_000;

function wait(ms: number, signal: AbortSignal) {
  if (ms === 0 || signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

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

  let poll;
  try {
    poll = parsePersonalAgentPollRequest(await readLimitedJson(request));
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    const status = code === "request_too_large" ? 413 : 400;
    return Response.json({ code: status === 413 ? code : "invalid_protocol_payload" }, { status });
  }
  const touched = await touchPersonalAgent(agent.id);
  if (touched.count !== 1) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  await wait(poll.waitMs ?? DEFAULT_WAIT_MS, request.signal);
  return Response.json({
    protocolVersion: PERSONAL_AGENT_PROTOCOL_VERSION,
    job: null,
  }, { headers: { "Cache-Control": "no-store" } });
}
