import { describe, expect, it } from "vitest";

import {
  parsePersonalAgentEvent,
  parsePersonalAgentPollRequest,
} from "@/lib/personal-agent/protocol";
import { readLimitedJson } from "@/lib/personal-agent/request";

describe("personal-agent protocol validation", () => {
  it("accepts the versioned hello and heartbeat messages", () => {
    expect(parsePersonalAgentEvent({
      type: "hello",
      protocolVersion: 1,
      adapter: { provider: "google", kind: "gemini_personal", status: "sign_in_required" },
    }).type).toBe("hello");
    expect(parsePersonalAgentEvent({
      type: "heartbeat", protocolVersion: 1, adapterStatus: "ready",
    }).type).toBe("heartbeat");
  });

  it.each([
    { type: "heartbeat", protocolVersion: 2, adapterStatus: "ready" },
    { type: "heartbeat", protocolVersion: 1, adapterStatus: "unknown" },
    { type: "heartbeat", protocolVersion: 1, adapterStatus: "ready", prompt: "forbidden" },
    { type: "hello", protocolVersion: 1, adapter: { provider: "openai", kind: "gemini_personal", status: "ready" } },
  ])("rejects invalid or widened event payloads", (payload) => {
    expect(() => parsePersonalAgentEvent(payload)).toThrow("invalid_protocol_payload");
  });

  it("bounds poll duration and rejects unknown fields", () => {
    expect(parsePersonalAgentPollRequest({ protocolVersion: 1, waitMs: 25_000 })).toEqual({ protocolVersion: 1, waitMs: 25_000 });
    expect(() => parsePersonalAgentPollRequest({ protocolVersion: 1, waitMs: 25_001 })).toThrow();
    expect(() => parsePersonalAgentPollRequest({ protocolVersion: 1, job: {} })).toThrow();
  });

  it("rejects bodies above the request limit even without content-length", async () => {
    await expect(readLimitedJson(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(5000) }),
    }))).rejects.toThrow("request_too_large");
  });
});
