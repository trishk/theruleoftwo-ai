export const PERSONAL_AGENT_PROTOCOL_VERSION = 1 as const;

export const GEMINI_ADAPTER_STATUSES = [
  "ready",
  "chrome_unavailable",
  "sign_in_required",
  "gemini_unavailable",
] as const;

export type GeminiAdapterStatus =
  (typeof GEMINI_ADAPTER_STATUSES)[number];

export type PersonalAgentEvent =
  | {
      type: "hello";
      protocolVersion: typeof PERSONAL_AGENT_PROTOCOL_VERSION;
      adapter: {
        provider: "google";
        kind: "gemini_personal";
        status: GeminiAdapterStatus;
      };
    }
  | {
      type: "heartbeat";
      protocolVersion: typeof PERSONAL_AGENT_PROTOCOL_VERSION;
      adapterStatus: GeminiAdapterStatus;
    }
  | { type: "generation.accepted"; protocolVersion: 1; requestId: string }
  | { type: "generation.submitted"; protocolVersion: 1; requestId: string }
  | { type: "generation.completed"; protocolVersion: 1; requestId: string; remoteConversationId: string; response: string }
  | { type: "generation.failed"; protocolVersion: 1; requestId: string; errorCode: "conversation_not_found" | "automation_changed" | "response_timeout_before_submit" }
  | { type: "generation.ambiguous"; protocolVersion: 1; requestId: string };

export type PersonalAgentPollRequest = {
  protocolVersion: typeof PERSONAL_AGENT_PROTOCOL_VERSION;
  waitMs?: number;
};

export type PersonalAgentPollResponse = {
  protocolVersion: typeof PERSONAL_AGENT_PROTOCOL_VERSION;
  job: null | {
    type: "generation.request";
    protocolVersion: 1;
    requestId: string;
    provider: "google";
    remoteConversationId: string | null;
    prompt: string;
  };
};

const statusSet = new Set<string>(GEMINI_ADAPTER_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isStatus(value: unknown): value is GeminiAdapterStatus {
  return typeof value === "string" && statusSet.has(value);
}

export function parsePersonalAgentEvent(value: unknown): PersonalAgentEvent {
  if (!isRecord(value) || value.protocolVersion !== PERSONAL_AGENT_PROTOCOL_VERSION) {
    throw new Error("invalid_protocol_payload");
  }

  if (value.type === "hello") {
    if (!hasExactKeys(value, ["type", "protocolVersion", "adapter"]) ||
        !isRecord(value.adapter) ||
        !hasExactKeys(value.adapter, ["provider", "kind", "status"]) ||
        value.adapter.provider !== "google" ||
        value.adapter.kind !== "gemini_personal" ||
        !isStatus(value.adapter.status)) {
      throw new Error("invalid_protocol_payload");
    }
    return value as PersonalAgentEvent;
  }

  if (value.type === "heartbeat") {
    if (!hasExactKeys(value, ["type", "protocolVersion", "adapterStatus"]) ||
        !isStatus(value.adapterStatus)) {
      throw new Error("invalid_protocol_payload");
    }
    return value as PersonalAgentEvent;
  }

  if (typeof value.type === "string" && value.type.startsWith("generation.")) {
    if (typeof value.requestId !== "string" || !value.requestId || value.requestId.length > 100) {
      throw new Error("invalid_protocol_payload");
    }
    if (value.type === "generation.accepted" || value.type === "generation.submitted" || value.type === "generation.ambiguous") {
      if (!hasExactKeys(value, ["type", "protocolVersion", "requestId"])) throw new Error("invalid_protocol_payload");
      return value as PersonalAgentEvent;
    }
    if (value.type === "generation.completed") {
      if (!hasExactKeys(value, ["type", "protocolVersion", "requestId", "remoteConversationId", "response"]) ||
          typeof value.remoteConversationId !== "string" || !value.remoteConversationId || value.remoteConversationId.length > 500 ||
          typeof value.response !== "string" || value.response.length > 1_000_000) throw new Error("invalid_protocol_payload");
      return value as PersonalAgentEvent;
    }
    if (value.type === "generation.failed") {
      const allowed = ["conversation_not_found", "automation_changed", "response_timeout_before_submit"];
      if (!hasExactKeys(value, ["type", "protocolVersion", "requestId", "errorCode"]) || typeof value.errorCode !== "string" || !allowed.includes(value.errorCode)) throw new Error("invalid_protocol_payload");
      return value as PersonalAgentEvent;
    }
  }

  throw new Error("invalid_protocol_payload");
}

export function parsePersonalAgentPollRequest(
  value: unknown
): PersonalAgentPollRequest {
  if (!isRecord(value) || value.protocolVersion !== PERSONAL_AGENT_PROTOCOL_VERSION) {
    throw new Error("invalid_protocol_payload");
  }
  const keys = value.waitMs === undefined
    ? ["protocolVersion"]
    : ["protocolVersion", "waitMs"];
  if (!hasExactKeys(value, keys) ||
      (value.waitMs !== undefined &&
        (typeof value.waitMs !== "number" ||
          !Number.isInteger(value.waitMs) ||
          value.waitMs < 0 ||
          value.waitMs > 25_000))) {
    throw new Error("invalid_protocol_payload");
  }
  return value as PersonalAgentPollRequest;
}
