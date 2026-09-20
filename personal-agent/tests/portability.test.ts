// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig, normalizeCdpEndpoint, saveMetadata } from "../src/config.js";
import { createCredentialStore, DpapiCredentialStore, FileCredentialStore } from "../src/credential-store.js";
import { FakeGeminiAdapter } from "../src/fake-gemini-adapter.js";
import { GeminiBrowserAdapter } from "../src/gemini-browser-adapter.js";
import type { GeminiBrowserConnector } from "../src/gemini-browser-driver.js";
import type { PersonalAgentHttpClient } from "../src/http-client.js";
import { ExecutionJournal } from "../src/journal.js";
import type { Logger } from "../src/logger.js";
import { credentialAgentId, credentialFingerprint } from "../src/pairing.js";
import { PersonalAgentRuntime } from "../src/runtime.js";

const directories: string[] = [];
const credential = `pa1.00000000-0000-4000-8000-000000000001.${"A".repeat(43)}`;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "personal-agent-portability-"));
  directories.push(directory);
  return directory;
}

async function pairedDataDirectory() {
  const dataDir = await temporaryDirectory();
  await saveMetadata(dataDir, {
    agentId: credentialAgentId(credential),
    origin: "https://example.test",
    credentialFingerprint: credentialFingerprint(credential),
    pairedAt: "2026-01-01T00:00:00.000Z",
    version: 2,
  });
  return dataDir;
}

describe("portable CDP configuration", () => {
  it("accepts loopback and single-label container endpoints without allowing public hosts", () => {
    expect(normalizeCdpEndpoint("http://127.0.0.1:9222")).toBe("http://127.0.0.1:9222");
    expect(normalizeCdpEndpoint("http://chromium:9222", true)).toBe("http://chromium:9222");
    expect(() => normalizeCdpEndpoint("http://chromium:9222")).toThrow("invalid_cdp_endpoint");

    for (const endpoint of [
      "http://192.168.1.2:9222",
      "http://example.com:9222",
      "https://chromium:9222",
      "http://chromium:9222/json",
      "http://user:pass@chromium:9222",
    ]) {
      expect(() => normalizeCdpEndpoint(endpoint)).toThrow("invalid_cdp_endpoint");
    }
  });

  it("passes a container endpoint to the existing Gemini adapter connector", async () => {
    const connector: GeminiBrowserConnector = { connect: vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }) };
    const adapter = new GeminiBrowserAdapter({
      geminiCdpEndpoint: "http://browser-service:9222",
      geminiHydrationTimeoutMs: 10,
      geminiResponseTimeoutMs: 10,
    }, connector);

    await expect(adapter.getStatus()).resolves.toBe("chrome_unavailable");
    expect(connector.connect).toHaveBeenCalledWith("http://browser-service:9222");
  });
});

describe("platform credential storage", () => {
  it("preserves Windows DPAPI as the default", () => {
    const store = createCredentialStore({
      platform: "win32",
      environment: { TRULEOFTWO_AGENT_CREDENTIAL_FILE: "C:\\agent\\plain-secret" },
      mode: "run",
      dataDir: "C:\\agent",
    });
    expect(store).toBeInstanceOf(DpapiCredentialStore);
  });

  it("reads a newline-terminated injected file on Linux without mutating it", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "credential");
    await writeFile(path, `${credential}\n`, { mode: 0o600 });
    const store = new FileCredentialStore(path, true);

    await expect(store.get()).resolves.toBe(credential);
    await expect(store.set("replacement-secret")).rejects.toThrow("credential_store_read_only");
    await store.delete();
    expect(await readFile(path, "utf8")).toBe(`${credential}\n`);
  });

  it("fails closed when Linux has no injected credential file", () => {
    expect(() => createCredentialStore({ platform: "linux", environment: {}, mode: "run", dataDir: "/var/lib/agent" }))
      .toThrow("credential_file_required");
    expect(() => createCredentialStore({
      platform: "linux",
      environment: { TRULEOFTWO_AGENT_CREDENTIAL_FILE: "C:\\agent\\credential" },
      mode: "run",
      dataDir: "/var/lib/agent",
    })).toThrow("invalid_credential_file");
    expect(createCredentialStore({
      platform: "linux",
      environment: { TRULEOFTWO_AGENT_CREDENTIAL_FILE: "/run/secrets/credential" },
      mode: "run",
      dataDir: "/var/lib/agent",
    })).toBeInstanceOf(FileCredentialStore);
  });

  it("does not log an injected credential while starting the Linux runtime", async () => {
    const dataDir = await pairedDataDirectory();
    const path = join(dataDir, "injected-credential");
    await writeFile(path, credential, { mode: 0o600 });
    const environment = { TRULEOFTWO_AGENT_DATA_DIR: dataDir, TRULEOFTWO_AGENT_CREDENTIAL_FILE: path };
    const config = await loadConfig(environment, "run", "win32");
    const store = new FileCredentialStore(path, true);
    const lines: string[] = [];
    const logger: Logger = { info: (line) => lines.push(line), error: (line) => lines.push(line) };
    // Assigned after the callback is created; the callback runs only after setup.
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const client = {
      event: vi.fn(async () => undefined),
      poll: vi.fn(async () => { runtime.stop(); return null; }),
    } as unknown as PersonalAgentHttpClient;
    runtime = new PersonalAgentRuntime({
      config,
      client,
      credentialStore: store,
      journal: new ExecutionJournal(config.journalPath),
      adapter: new FakeGeminiAdapter(),
      logger,
    });

    await expect(runtime.run()).resolves.toBe("stopped");
    expect(lines.join(" ")).not.toContain(credential);
  });
});

describe("persistent Linux configuration", () => {
  it("fails closed instead of dropping an unrecognized journal phase", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "in-flight.json");
    await writeFile(path, JSON.stringify({ version: 1, entries: { "request-uncertain": "unknown_phase" } }), { mode: 0o600 });

    await expect(new ExecutionJournal(path).load()).rejects.toThrow("invalid_execution_journal");
  });

  it("requires explicit Linux storage and honors a custom persistent journal path", async () => {
    await expect(loadConfig({ TRULEOFTWO_BASE_URL: "https://example.test" }, "pair", "linux"))
      .rejects.toThrow("data_dir_required");

    await expect(loadConfig({
      TRULEOFTWO_AGENT_DATA_DIR: "C:\\agent",
      TRULEOFTWO_BASE_URL: "https://example.test",
    }, "pair", "linux")).rejects.toThrow("invalid_data_dir");

    const linuxConfig = await loadConfig({
      TRULEOFTWO_AGENT_DATA_DIR: "/var/lib/agent",
      TRULEOFTWO_AGENT_JOURNAL_PATH: "/var/lib/agent/recovery/in-flight.json",
      TRULEOFTWO_GEMINI_CDP_ENDPOINT: "http://chromium:9222",
      TRULEOFTWO_ALLOW_PRIVATE_CONTAINER_CDP: "1",
      TRULEOFTWO_BASE_URL: "https://example.test",
    }, "pair", "linux");
    expect(linuxConfig.journalPath).toBe("/var/lib/agent/recovery/in-flight.json");
    expect(linuxConfig.geminiCdpEndpoint).toBe("http://chromium:9222");

    const dataDir = await pairedDataDirectory();
    const persistentDirectory = await temporaryDirectory();
    const customJournal = join(persistentDirectory, "recovery", "in-flight.json");
    const config = await loadConfig({
      TRULEOFTWO_AGENT_DATA_DIR: dataDir,
      TRULEOFTWO_AGENT_JOURNAL_PATH: customJournal,
    }, "run", "win32");
    expect(config.journalPath).toBe(customJournal);

    const first = new ExecutionJournal(config.journalPath);
    await first.set("request-persisted", "send_attempted");
    const afterRestart = new ExecutionJournal(config.journalPath);
    await afterRestart.load();
    expect(afterRestart.get("request-persisted")).toBe("send_attempted");
  });
});