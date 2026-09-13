import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import type { AgentConfig, AgentMetadata } from "./config.js";
import { loadMetadata, metadataPath, saveMetadata } from "./config.js";
import type { CredentialStore } from "./credential-store.js";
import type { PersonalAgentHttpClient } from "./http-client.js";
import type { Logger } from "./logger.js";

export async function pairAgent(token: string, config: AgentConfig, client: PersonalAgentHttpClient, store: CredentialStore, logger: Logger): Promise<void> {
  if (!token) throw new Error("pairing_token_required");
  const result = await client.pair(token);
  const previousMetadata = await loadMetadata(config.dataDir);
  const nextMetadata: AgentMetadata = {
    agentId: result.agentId,
    origin: config.baseUrl,
    credentialFingerprint: credentialFingerprint(result.agentCredential),
    pairedAt: new Date().toISOString(),
    version: 2,
  };
  await saveMetadata(config.dataDir, nextMetadata);
  try {
    await store.set(result.agentCredential);
  } catch (error) {
    if (previousMetadata) await saveMetadata(config.dataDir, previousMetadata);
    else await rm(metadataPath(config.dataDir), { force: true });
    throw error;
  }
  logger.info(`Paired agent ${result.agentId}.`);
}

export function credentialFingerprint(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export function credentialAgentId(credential: string): string | null {
  return credential.match(/^pa1\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/i)?.[1] ?? null;
}
