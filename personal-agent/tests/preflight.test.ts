// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentConfig } from "../src/config.js";
import type { CredentialStore } from "../src/credential-store.js";
import type { PersonalAgentHttpClient } from "../src/http-client.js";
import { ExecutionJournal } from "../src/journal.js";
import type { Logger } from "../src/logger.js";
import { credentialFingerprint } from "../src/pairing.js";
import { runPreflight } from "../src/preflight.js";
import type { PersonalProviderAdapter } from "../src/types.js";

const directories: string[] = [];
const agentId = "00000000-0000-4000-8000-000000000001";
const credential = `pa1.${agentId}.${"A".repeat(43)}`;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(status: "ready" | "chrome_unavailable" | "sign_in_required" | "gemini_unavailable" = "ready") {
  const dataDir = await mkdtemp(join(tmpdir(), "personal-agent-preflight-"));
  directories.push(dataDir);
  const config: AgentConfig = {
    baseUrl: "https://example.test",
    metadata: {
      agentId,
      origin: "https://example.test",
      credentialFingerprint: credentialFingerprint(credential),
      pairedAt: "2026-01-01T00:00:00.000Z",
      version: 2,
    },
    dataDir,
    journalPath: join(dataDir, "recovery", "in-flight.json"),
    pollWaitMs: 0,
    requestTimeoutMs: 100,
    heartbeatMs: 15_000,
    geminiCdpEndpoint: "http://chromium:9222",
    geminiHydrationTimeoutMs: 10,
    geminiResponseTimeoutMs: 10,
  };
  const credentialStore: CredentialStore = {
    get: vi.fn(async () => credential),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const client = { event: vi.fn(async () => undefined) } as unknown as PersonalAgentHttpClient;
  const adapter = {
    provider: "google",
    getStatus: vi.fn(async () => status),
    execute: vi.fn(),
  } satisfies PersonalProviderAdapter;
  const lines: string[] = [];
  const logger: Logger = { info: (line) => lines.push(line), error: (line) => lines.push(line) };
  return { config, credentialStore, client, adapter, lines, logger };
}

describe("container E2E preflight", () => {
  it("checks paired state, durable paths, Gemini readiness, and authenticated server connectivity without polling or sending a prompt", async () => {
    const state = await setup();

    await expect(runPreflight({
      ...state,
      journal: new ExecutionJournal(state.config.journalPath),
    })).resolves.toEqual({ adapterStatus: "ready" });

    expect(state.client.event).toHaveBeenCalledWith(credential, {
      type: "heartbeat",
      protocolVersion: 1,
      adapterStatus: "ready",
    });
    expect(state.adapter.execute).not.toHaveBeenCalled();
    expect(state.lines).toEqual([
      "Configuration and paired credential: valid.",
      "Persistent Agent state and recovery journal: writable.",
      "Chromium CDP, browser, and Gemini session: ready.",
      "TheRuleOfTwo connectivity and Agent authentication: valid.",
      "Preflight passed. No Gemini prompt was sent.",
    ]);
    expect(state.lines.join(" ")).not.toContain(credential);
  });

  it("reports sign-in-required to the server and fails without sending a generation request", async () => {
    const state = await setup("sign_in_required");

    await expect(runPreflight({
      ...state,
      journal: new ExecutionJournal(state.config.journalPath),
    })).rejects.toThrow("preflight_sign_in_required");

    expect(state.client.event).toHaveBeenCalledWith(credential, {
      type: "heartbeat",
      protocolVersion: 1,
      adapterStatus: "sign_in_required",
    });
    expect(state.lines.join(" ")).not.toContain(credential);
  });

  it("fails closed on credential and metadata mismatch before contacting the server or browser", async () => {
    const state = await setup();
    state.config.metadata = { ...state.config.metadata!, credentialFingerprint: "0".repeat(64) };

    await expect(runPreflight({
      ...state,
      journal: new ExecutionJournal(state.config.journalPath),
    })).rejects.toThrow("paired_state_mismatch");

    expect(state.client.event).not.toHaveBeenCalled();
    expect(state.adapter.getStatus).not.toHaveBeenCalled();
  });
});
