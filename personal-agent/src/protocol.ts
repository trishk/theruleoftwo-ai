import type { GenerationJob } from "./types.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

export function parsePairResponse(value: unknown): { protocolVersion: 1; agentId: string; agentCredential: string } {
  if (!record(value) || !exactKeys(value, ["protocolVersion", "agentId", "agentCredential"]) || value.protocolVersion !== 1 ||
      typeof value.agentId !== "string" || !value.agentId || typeof value.agentCredential !== "string" || !value.agentCredential) {
    throw new Error("invalid_server_response");
  }
  return value as { protocolVersion: 1; agentId: string; agentCredential: string };
}

export function parsePollResponse(value: unknown): { protocolVersion: 1; job: GenerationJob | null } {
  if (!record(value) || !exactKeys(value, ["protocolVersion", "job"]) || value.protocolVersion !== 1) throw new Error("invalid_server_response");
  if (value.job === null) return { protocolVersion: 1, job: null };
  const job = value.job;
  if (!record(job) || !exactKeys(job, ["type", "protocolVersion", "requestId", "provider", "remoteConversationId", "prompt"]) ||
      job.type !== "generation.request" || job.protocolVersion !== 1 || job.provider !== "google" ||
      typeof job.requestId !== "string" || !job.requestId || job.requestId.length > 100 ||
      (job.remoteConversationId !== null && typeof job.remoteConversationId !== "string") || typeof job.prompt !== "string") {
    throw new Error("invalid_server_response");
  }
  return { protocolVersion: 1, job: job as GenerationJob };
}

export function parseEventResponse(value: unknown): void {
  if (!record(value) || !exactKeys(value, ["protocolVersion", "accepted"]) || value.protocolVersion !== 1 || value.accepted !== true) {
    throw new Error("invalid_server_response");
  }
}
