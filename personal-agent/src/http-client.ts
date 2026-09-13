import { parseEventResponse, parsePairResponse, parsePollResponse } from "./protocol.js";
import type { AgentEvent, GenerationJob } from "./types.js";

export class AgentHttpError extends Error {
  constructor(readonly code: "unauthorized" | "rate_limited" | "invalid_request" | "server_error" | "network_error" | "timeout" | "response_too_large" | "invalid_response", readonly transient: boolean) {
    super(code);
  }
}

type Fetch = typeof fetch;
const MAX_RESPONSE_BYTES = 1_100_000;

export class PersonalAgentHttpClient {
  constructor(private readonly baseUrl: string, private readonly timeoutMs: number, private readonly fetchImpl: Fetch = fetch) {}

  async pair(pairingToken: string): Promise<{ agentId: string; agentCredential: string }> {
    const value = await this.post("/api/personal-agent/pair", { pairingToken }, null, this.timeoutMs);
    try { return parsePairResponse(value); } catch { throw new AgentHttpError("invalid_response", false); }
  }

  async poll(credential: string, waitMs: number, signal?: AbortSignal): Promise<GenerationJob | null> {
    const value = await this.post("/api/personal-agent/poll", { protocolVersion: 1, waitMs }, credential, this.timeoutMs + waitMs, signal);
    try { return parsePollResponse(value).job; } catch { throw new AgentHttpError("invalid_response", false); }
  }

  async event(credential: string, event: AgentEvent, signal?: AbortSignal): Promise<void> {
    const value = await this.post("/api/personal-agent/events", event, credential, this.timeoutMs, signal);
    try { parseEventResponse(value); } catch { throw new AgentHttpError("invalid_response", false); }
  }

  private async post(path: string, body: unknown, credential: string | null, timeoutMs: number, outerSignal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const abort = () => controller.abort("shutdown");
    let abortListenerRegistered = false;
    if (outerSignal?.aborted) {
      controller.abort("shutdown");
    } else if (outerSignal) {
      outerSignal.addEventListener("abort", abort, { once: true });
      abortListenerRegistered = true;
    }
    try {
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
      if (credential) headers.authorization = `Bearer ${credential}`;
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) throw new AgentHttpError("invalid_response", false);
      if (!response.ok) {
        if (response.status === 401) throw new AgentHttpError("unauthorized", false);
        if (response.status === 429) throw new AgentHttpError("rate_limited", true);
        if (response.status >= 500) throw new AgentHttpError("server_error", true);
        throw new AgentHttpError("invalid_request", false);
      }
      const declared = Number(response.headers.get("content-length"));
      if (declared > MAX_RESPONSE_BYTES) throw new AgentHttpError("response_too_large", false);
      const text = await readBoundedBody(response, MAX_RESPONSE_BYTES);
      try { return JSON.parse(text) as unknown; } catch { throw new AgentHttpError("invalid_response", false); }
    } catch (error) {
      if (error instanceof AgentHttpError) throw error;
      if (controller.signal.aborted) throw new AgentHttpError(controller.signal.reason === "timeout" ? "timeout" : "network_error", true);
      throw new AgentHttpError("network_error", true);
    } finally {
      clearTimeout(timer);
      if (abortListenerRegistered) outerSignal?.removeEventListener("abort", abort);
    }
  }
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new AgentHttpError("response_too_large", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    throw new AgentHttpError("invalid_response", false);
  }
}
