import { join } from "node:path";
import { readJsonFile, writeJsonAtomic } from "./storage.js";

export type AgentMetadata = { agentId: string; origin: string; credentialFingerprint: string; pairedAt: string; version: 2 };
export type AgentConfig = { baseUrl: string; metadata: AgentMetadata | null; pollWaitMs: number; requestTimeoutMs: number; heartbeatMs: number; dataDir: string };

export function defaultDataDir(environment: NodeJS.ProcessEnv = process.env): string {
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

export async function loadConfig(environment: NodeJS.ProcessEnv = process.env, mode: "pair" | "run" = "run"): Promise<AgentConfig> {
  const dataDir = environment.TRULEOFTWO_AGENT_DATA_DIR || defaultDataDir(environment);
  const metadata = await readJsonFile<AgentMetadata>(join(dataDir, "agent.json"));
  const configuredOrigin = environment.TRULEOFTWO_BASE_URL ? normalizeOrigin(environment.TRULEOFTWO_BASE_URL) : null;
  const pairedOrigin = metadata ? normalizeOrigin(metadata.origin) : null;
  if (mode === "run" && !metadata) throw new Error("pairing_metadata_required");
  if (mode === "run" && configuredOrigin && configuredOrigin !== pairedOrigin) throw new Error("paired_origin_mismatch");
  const baseUrl = mode === "run" ? pairedOrigin : configuredOrigin ?? pairedOrigin;
  if (!baseUrl) throw new Error("base_url_required");
  return {
    baseUrl, metadata, dataDir,
    pollWaitMs: integerSetting(environment.TRULEOFTWO_POLL_WAIT_MS, 20_000, 25_000),
    requestTimeoutMs: integerSetting(environment.TRULEOFTWO_REQUEST_TIMEOUT_MS, 30_000, 120_000),
    heartbeatMs: integerSetting(environment.TRULEOFTWO_HEARTBEAT_MS, 15_000, 300_000),
  };
}

export const metadataPath = (dataDir: string) => join(dataDir, "agent.json");
export const credentialPath = (dataDir: string) => join(dataDir, "credential.dpapi");
export const journalPath = (dataDir: string) => join(dataDir, "in-flight.json");
export const saveMetadata = (dataDir: string, metadata: AgentMetadata) => writeJsonAtomic(metadataPath(dataDir), metadata);
export const loadMetadata = (dataDir: string) => readJsonFile<AgentMetadata>(metadataPath(dataDir));
