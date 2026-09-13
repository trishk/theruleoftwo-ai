export const PROTOCOL_VERSION = 1 as const;

export type AdapterStatus = "ready" | "chrome_unavailable" | "sign_in_required" | "gemini_unavailable";

export type GenerationJob = {
  type: "generation.request";
  protocolVersion: 1;
  requestId: string;
  provider: "google";
  remoteConversationId: string | null;
  prompt: string;
};

export type AgentEvent =
  | { type: "hello"; protocolVersion: 1; adapter: { provider: "google"; kind: "gemini_personal"; status: AdapterStatus } }
  | { type: "heartbeat"; protocolVersion: 1; adapterStatus: AdapterStatus }
  | { type: "generation.accepted" | "generation.submitted" | "generation.ambiguous"; protocolVersion: 1; requestId: string }
  | { type: "generation.completed"; protocolVersion: 1; requestId: string; remoteConversationId: string; response: string }
  | { type: "generation.failed"; protocolVersion: 1; requestId: string; errorCode: "conversation_not_found" | "automation_changed" | "response_timeout_before_submit" };

export type AdapterCallbacks = { submitted(): Promise<void> };
export type AdapterResult = { remoteConversationId: string; response: string };

export interface PersonalProviderAdapter {
  readonly provider: "google";
  getStatus(): Promise<AdapterStatus>;
  execute(job: GenerationJob, callbacks: AdapterCallbacks): Promise<AdapterResult>;
}
