import { randomUUID } from "node:crypto";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentConfig } from "./config.js";
import type { CredentialStore } from "./credential-store.js";
import type { PersonalAgentHttpClient } from "./http-client.js";
import type { ExecutionJournal } from "./journal.js";
import type { Logger } from "./logger.js";
import { credentialAgentId, credentialFingerprint } from "./pairing.js";
import type { AdapterStatus, PersonalProviderAdapter } from "./types.js";

type PreflightDependencies = {
  config: AgentConfig;
  client: PersonalAgentHttpClient;
  credentialStore: CredentialStore;
  journal: ExecutionJournal;
  adapter: PersonalProviderAdapter;
  logger: Logger;
};

export async function runPreflight(dependencies: PreflightDependencies): Promise<{ adapterStatus: AdapterStatus }> {
  const { config, client, credentialStore, journal, adapter, logger } = dependencies;
  const credential = await credentialStore.get();
  if (!credential || !config.metadata ||
      credentialFingerprint(credential) !== config.metadata.credentialFingerprint ||
      credentialAgentId(credential) !== config.metadata.agentId) {
    throw new Error("paired_state_mismatch");
  }
  logger.info("Configuration and paired credential: valid.");

  await journal.load();
  try {
    for (const directory of new Set([config.dataDir, dirname(config.journalPath)])) {
      await assertDirectoryWritable(directory);
    }
  } catch {
    throw new Error("agent_state_not_writable");
  }
  logger.info("Persistent Agent state and recovery journal: writable.");

  const adapterStatus = await adapter.getStatus();
  logger.info(`Chromium CDP, browser, and Gemini session: ${adapterStatus}.`);
  await client.event(credential, { type: "heartbeat", protocolVersion: 1, adapterStatus });
  logger.info("TheRuleOfTwo connectivity and Agent authentication: valid.");

  if (adapterStatus !== "ready") throw new Error(`preflight_${adapterStatus}`);
  logger.info("Preflight passed. No Gemini prompt was sent.");
  return { adapterStatus };
}

async function assertDirectoryWritable(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const probePath = join(directory, `.preflight-${randomUUID()}`);
  const handle = await open(probePath, "wx", 0o600);
  try {
    await handle.writeFile("preflight\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
    await rm(probePath, { force: true });
  }
}
