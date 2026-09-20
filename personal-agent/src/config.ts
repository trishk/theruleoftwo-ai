import { join, posix, win32 } from "node:path";
import { readJsonFile, writeJsonAtomic } from "./storage.js";

export type AgentMetadata = { agentId: string; origin: string; credentialFingerprint: string; pairedAt: string; version: 2 };
export type AgentConfig = {
  baseUrl: string;
  metadata: AgentMetadata | null;
  pollWaitMs: number;
  requestTimeoutMs: number;
  heartbeatMs: number;
  dataDir: string;
  journalPath: string;
  geminiCdpEndpoint: string;
  geminiHydrationTimeoutMs: number;
  geminiResponseTimeoutMs: number;
};

const AGENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIAL_FINGERPRINT = /^[0-9a-f]{64}$/;

function parseAgentMetadata(value: unknown): AgentMetadata | null {
  if (value === undefined) return null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_agent_metadata");
  const record = value as Record<string, unknown>;
  const expectedKeys = ["agentId", "origin", "credentialFingerprint", "pairedAt", "version"];
  if (Object.keys(record).sort().join("|") !== expectedKeys.sort().join("|") ||
      typeof record.agentId !== "string" || !AGENT_ID.test(record.agentId) ||
      typeof record.origin !== "string" ||
      typeof record.credentialFingerprint !== "string" || !CREDENTIAL_FINGERPRINT.test(record.credentialFingerprint) ||
      typeof record.pairedAt !== "string" || !isCanonicalTimestamp(record.pairedAt) ||
      record.version !== 2) {
    throw new Error("invalid_agent_metadata");
  }
  return record as AgentMetadata;
}

function isCanonicalTimestamp(value: string): boolean {
  try { return new Date(value).toISOString() === value; }
  catch { return false; }
}

export function defaultDataDir(environment: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") throw new Error("data_dir_required");
  const root = environment.LOCALAPPDATA;
  if (!root) throw new Error("local_app_data_unavailable");
  return join(root, "TheRuleOfTwo", "PersonalAgent");
}

function integerSetting(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new Error("invalid_configuration");
  return parsed;
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.username !== "" || url.password !== "") throw new Error("url_userinfo_forbidden");
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("https_required");
  return url.origin;
}

export function normalizeCdpEndpoint(value: string, allowContainerService = false): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  const containerService = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(hostname);
  if (url.protocol !== "http:" || url.username || url.password ||
      (!loopback && !(allowContainerService && containerService)) || !url.port ||
      (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error("invalid_cdp_endpoint");
  }
  return url.origin;
}

export const normalizeLoopbackCdpEndpoint = (value: string) => normalizeCdpEndpoint(value);

function absolutePathSetting(value: string, errorCode: string, platform: NodeJS.Platform): string {
  const absolute = platform === "win32" ? win32.isAbsolute(value) : posix.isAbsolute(value);
  if (!absolute) throw new Error(errorCode);
  return value;
}

export async function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  mode: "pair" | "run" = "run",
  platform: NodeJS.Platform = process.platform,
): Promise<AgentConfig> {
  const dataDir = environment.TRULEOFTWO_AGENT_DATA_DIR
    ? absolutePathSetting(environment.TRULEOFTWO_AGENT_DATA_DIR, "invalid_data_dir", platform)
    : defaultDataDir(environment, platform);
  const configuredJournalPath = environment.TRULEOFTWO_AGENT_JOURNAL_PATH;
  const metadata = parseAgentMetadata(await readJsonFile<unknown>(join(dataDir, "agent.json")));
  const configuredOrigin = environment.TRULEOFTWO_BASE_URL ? normalizeOrigin(environment.TRULEOFTWO_BASE_URL) : null;
  const pairedOrigin = metadata ? normalizeOrigin(metadata.origin) : null;
  if (mode === "run" && !metadata) throw new Error("pairing_metadata_required");
  if (mode === "run" && configuredOrigin && configuredOrigin !== pairedOrigin) throw new Error("paired_origin_mismatch");
  const baseUrl = mode === "run" ? pairedOrigin : configuredOrigin ?? pairedOrigin;
  if (!baseUrl) throw new Error("base_url_required");
  return {
    baseUrl, metadata, dataDir,
    journalPath: configuredJournalPath
      ? absolutePathSetting(configuredJournalPath, "invalid_journal_path", platform)
      : journalPath(dataDir),
    pollWaitMs: integerSetting(environment.TRULEOFTWO_POLL_WAIT_MS, 20_000, 25_000),
    requestTimeoutMs: integerSetting(environment.TRULEOFTWO_REQUEST_TIMEOUT_MS, 30_000, 120_000),
    heartbeatMs: integerSetting(environment.TRULEOFTWO_HEARTBEAT_MS, 15_000, 300_000),
    geminiCdpEndpoint: normalizeCdpEndpoint(
      environment.TRULEOFTWO_GEMINI_CDP_ENDPOINT ?? "http://127.0.0.1:9222",
      platform !== "win32" && environment.TRULEOFTWO_ALLOW_PRIVATE_CONTAINER_CDP === "1",
    ),
    geminiHydrationTimeoutMs: integerSetting(environment.TRULEOFTWO_GEMINI_HYDRATION_TIMEOUT_MS, 15_000, 60_000),
    geminiResponseTimeoutMs: integerSetting(environment.TRULEOFTWO_GEMINI_RESPONSE_TIMEOUT_MS, 120_000, 600_000),
  };
}

export const metadataPath = (dataDir: string) => join(dataDir, "agent.json");
export const credentialPath = (dataDir: string) => join(dataDir, "credential.dpapi");
export const journalPath = (dataDir: string) => join(dataDir, "in-flight.json");
export const saveMetadata = (dataDir: string, metadata: AgentMetadata) => writeJsonAtomic(metadataPath(dataDir), metadata);
export const loadMetadata = (dataDir: string) => readJsonFile<AgentMetadata>(metadataPath(dataDir));
