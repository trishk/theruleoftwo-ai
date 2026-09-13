// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExponentialBackoff, delay } from "../src/backoff.js";
import { loadConfig, normalizeOrigin, saveMetadata, type AgentConfig, type AgentMetadata } from "../src/config.js";
import { DpapiCredentialStore, type CredentialStore } from "../src/credential-store.js";
import { FakeGeminiAdapter } from "../src/fake-gemini-adapter.js";
import { AgentHttpError, PersonalAgentHttpClient } from "../src/http-client.js";
import { ExecutionJournal } from "../src/journal.js";
import { readPairingToken, validatePairArguments } from "../src/input.js";
import type { Logger } from "../src/logger.js";
import { credentialFingerprint, pairAgent } from "../src/pairing.js";
import { PersonalAgentRuntime } from "../src/runtime.js";
import type { AgentEvent, GenerationJob, PersonalProviderAdapter } from "../src/types.js";

const temporaryDirectories: string[] = [];
const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const CREDENTIAL = `pa1.${AGENT_ID}.${"A".repeat(43)}`;
const OTHER_CREDENTIAL = `pa1.${AGENT_ID}.${"B".repeat(43)}`;
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function temporaryDirectory() { const path = await mkdtemp(join(tmpdir(), "personal-agent-test-")); temporaryDirectories.push(path); return path; }

function config(dataDir: string): AgentConfig {
  return { baseUrl: "https://example.test", metadata: metadata(CREDENTIAL), dataDir, pollWaitMs: 0, requestTimeoutMs: 100, heartbeatMs: 300_000 };
}

function metadata(credential: string, origin = "https://example.test"): AgentMetadata {
  return { agentId: AGENT_ID, origin, credentialFingerprint: credentialFingerprint(credential), pairedAt: "2026-01-01T00:00:00.000Z", version: 2 };
}

function memoryStore(initial: string | null = CREDENTIAL) {
  let value = initial;
  return {
    store: {
      get: vi.fn(async () => value),
      set: vi.fn(async (next: string) => { value = next; }),
      delete: vi.fn(async () => { value = null; }),
    } satisfies CredentialStore,
    value: () => value,
  };
}

function logger() {
  const lines: string[] = [];
  return { logger: { info: (line: string) => lines.push(line), error: (line: string) => lines.push(line) } satisfies Logger, lines };
}

const job: GenerationJob = { type: "generation.request", protocolVersion: 1, requestId: "request-1", provider: "google", remoteConversationId: null, prompt: "TOP SECRET PROMPT" };

describe("credential storage and pairing", () => {
  it("stores only DPAPI-protected ciphertext and can retrieve it", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "credential.dpapi");
    const dpapi = { protect: vi.fn(async () => "ciphertext"), unprotect: vi.fn(async () => "pa1.secret") };
    const store = new DpapiCredentialStore(path, dpapi);
    await store.set("pa1.secret");
    expect(await readFile(path, "utf8")).toBe("ciphertext");
    expect(await store.get()).toBe("pa1.secret");
    await store.delete();
    expect(await store.get()).toBeNull();
  });

  it("pairs, persists metadata, and does not log either secret", async () => {
    const directory = await temporaryDirectory();
    const credentials = memoryStore(null);
    const output = logger();
    const client = { pair: vi.fn(async () => ({ agentId: "agent-1", agentCredential: "persistent-secret" })) } as unknown as PersonalAgentHttpClient;
    await pairAgent("one-time-secret", config(directory), client, credentials.store, output.logger);
    expect(credentials.value()).toBe("persistent-secret");
    expect(JSON.parse(await readFile(join(directory, "agent.json"), "utf8"))).toMatchObject({ agentId: "agent-1", origin: "https://example.test", version: 2 });
    expect(output.lines.join(" ")).not.toContain("persistent-secret");
    expect(output.lines.join(" ")).not.toContain("one-time-secret");
  });

  it("re-pairing replaces the previous credential", async () => {
    const directory = await temporaryDirectory();
    const credentials = memoryStore("old-secret");
    const client = { pair: vi.fn(async () => ({ agentId: "agent-2", agentCredential: "new-secret" })) } as unknown as PersonalAgentHttpClient;
    await pairAgent("pair-token", config(directory), client, credentials.store, logger().logger);
    expect(credentials.value()).toBe("new-secret");
    expect(credentials.store.set).toHaveBeenCalledTimes(1);
  });

  it("maps a failed pairing to a narrow error", async () => {
    const client = new PersonalAgentHttpClient("https://example.test", 100, vi.fn(async () => new Response('{"code":"invalid_pairing_token","detail":"internal"}', { status: 401 })) as typeof fetch);
    await expect(client.pair("pair-secret")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("restores previous metadata when new credential persistence fails", async () => {
    const directory = await temporaryDirectory();
    const previous = metadata("old-secret", "https://old.example.test");
    await saveMetadata(directory, previous);
    const store: CredentialStore = { get: vi.fn(), set: vi.fn(async () => { throw new Error("disk_failure"); }), delete: vi.fn() };
    const client = { pair: vi.fn(async () => ({ agentId: "agent-2", agentCredential: "new-secret" })) } as unknown as PersonalAgentHttpClient;
    await expect(pairAgent("pair-token", { ...config(directory), baseUrl: "https://new.example.test" }, client, store, logger().logger)).rejects.toThrow("disk_failure");
    expect(JSON.parse(await readFile(join(directory, "agent.json"), "utf8"))).toEqual(previous);
  });
});

describe("origin and paired-state binding", () => {
  it("normalizes origins and rejects URL userinfo", () => {
    expect(normalizeOrigin("https://Example.test/some/path?q=1")).toBe("https://example.test");
    expect(() => normalizeOrigin("https://user:pass@example.test")).toThrow("url_userinfo_forbidden");
    expect(() => normalizeOrigin("http://example.test")).toThrow("https_required");
    expect(normalizeOrigin("http://localhost:3000/path")).toBe("http://localhost:3000");
  });

  it("refuses a configured origin different from the paired origin", async () => {
    const directory = await temporaryDirectory();
    await saveMetadata(directory, metadata("pa1.secret", "https://origin-a.test"));
    await expect(loadConfig({ LOCALAPPDATA: directory, TRULEOFTWO_AGENT_DATA_DIR: directory, TRULEOFTWO_BASE_URL: "https://origin-b.test/path" }, "run"))
      .rejects.toThrow("paired_origin_mismatch");
  });

  it.each([
    ["new credential with stale metadata", OTHER_CREDENTIAL, CREDENTIAL],
    ["new metadata with old credential", CREDENTIAL, OTHER_CREDENTIAL],
  ])("fails closed for %s without making an HTTP request", async (_name, storedCredential, metadataCredential) => {
    const directory = await temporaryDirectory();
    const client: FakeClient = { poll: vi.fn(), event: vi.fn() };
    const setup = await makeRuntime({ client, initialCredential: storedCredential, dataDir: directory });
    const boundConfig = { ...config(directory), metadata: metadata(metadataCredential) };
    const runtime = new PersonalAgentRuntime({ config: boundConfig, client: client as unknown as PersonalAgentHttpClient, credentialStore: setup.credentials.store,
      journal: new ExecutionJournal(join(directory, "bound-journal.json")), adapter: new FakeGeminiAdapter(), logger: setup.output.logger });
    await expect(runtime.run()).rejects.toThrow("paired_state_mismatch");
    expect(client.event).not.toHaveBeenCalled();
    expect(client.poll).not.toHaveBeenCalled();
  });
});

describe("pairing-token input", () => {
  it("reads and trims the token from stdin", async () => {
    const { Readable } = await import("node:stream");
    await expect(readPairingToken(Readable.from(["  pair-token\r\n"]))).resolves.toBe("pair-token");
  });

  it("rejects an argv token and accepts the argument-free pair command", () => {
    expect(() => validatePairArguments(["node", "cli.js", "pair"])).not.toThrow();
    expect(() => validatePairArguments(["node", "cli.js", "pair", "secret"])).toThrow("pairing_token_must_use_stdin");
  });
});

describe("HTTP protocol", () => {
  it("authenticates poll and event requests without exposing the header", async () => {
    const requests: RequestInit[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(init ?? {});
      return String(url).endsWith("/poll")
        ? Response.json({ protocolVersion: 1, job: null })
        : Response.json({ protocolVersion: 1, accepted: true });
    }) as typeof fetch;
    const client = new PersonalAgentHttpClient("https://example.test", 100, fetchMock);
    await client.poll("pa1.secret", 0);
    await client.event("pa1.secret", { type: "heartbeat", protocolVersion: 1, adapterStatus: "ready" });
    expect((requests[0].headers as Record<string, string>).authorization).toBe("Bearer pa1.secret");
    expect((requests[1].headers as Record<string, string>).authorization).toBe("Bearer pa1.secret");
  });

  it("rejects malformed and oversized JSON responses", async () => {
    const malformed = new PersonalAgentHttpClient("https://example.test", 100, vi.fn(async () => new Response("not-json")) as typeof fetch);
    await expect(malformed.poll("secret", 0)).rejects.toMatchObject({ code: "invalid_response" });
    const oversized = new PersonalAgentHttpClient("https://example.test", 100, vi.fn(async () => new Response("x", { headers: { "content-length": "1100001" } })) as typeof fetch);
    await expect(oversized.poll("secret", 0)).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("does not follow redirects or forward Authorization", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 307, headers: { location: "https://attacker.test/collect" } });
    }) as typeof fetch;
    const client = new PersonalAgentHttpClient("https://example.test", 100, fetchMock);
    await expect(client.poll("pa1.secret", 0)).rejects.toMatchObject({ code: "invalid_response", transient: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops reading a chunked response once the byte limit is exceeded", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600_000));
        controller.enqueue(new Uint8Array(600_000));
      },
      cancel() { cancelled = true; },
    });
    const client = new PersonalAgentHttpClient("https://example.test", 100, vi.fn(async () => new Response(body)) as typeof fetch);
    await expect(client.poll("pa1.secret", 0)).rejects.toMatchObject({ code: "response_too_large" });
    expect(cancelled).toBe(true);
  });

  it("forwards an already-aborted outer signal before fetch starts", async () => {
    const outer = new AbortController();
    outer.abort();
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    }) as typeof fetch;
    const client = new PersonalAgentHttpClient("https://example.test", 5_000, fetchMock);
    const startedAt = performance.now();
    const result = client.poll(CREDENTIAL, 0, outer.signal);
    await expect(result).rejects.toMatchObject({ code: "network_error", transient: true });
    expect(performance.now() - startedAt).toBeLessThan(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(result.catch((error: Error) => error.message)).resolves.not.toContain(CREDENTIAL);
  });

  it("continues to forward a future outer abort", async () => {
    const outer = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      await new Promise<void>((_resolve, reject) => fetchSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      return Response.json({ protocolVersion: 1, job: null });
    }) as typeof fetch;
    const client = new PersonalAgentHttpClient("https://example.test", 5_000, fetchMock);
    const result = client.poll(CREDENTIAL, 0, outer.signal);
    await vi.waitFor(() => expect(fetchSignal).toBeDefined());
    outer.abort();
    await expect(result).rejects.toMatchObject({ code: "network_error", transient: true });
    expect(fetchSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

type FakeClient = {
  poll: ReturnType<typeof vi.fn>;
  event: ReturnType<typeof vi.fn>;
};

async function makeRuntime(options: { adapter?: PersonalProviderAdapter; client?: FakeClient; initialCredential?: string | null; dataDir?: string } = {}) {
  const dataDir = options.dataDir ?? await temporaryDirectory();
  const credentials = memoryStore(options.initialCredential === undefined ? CREDENTIAL : options.initialCredential);
  const output = logger();
  const client = options.client ?? { poll: vi.fn(), event: vi.fn(async () => undefined) };
  const runtime = new PersonalAgentRuntime({
    config: config(dataDir), client: client as unknown as PersonalAgentHttpClient, credentialStore: credentials.store,
    journal: new ExecutionJournal(join(dataDir, "journal.json")), adapter: options.adapter ?? new FakeGeminiAdapter(), logger: output.logger,
    sleep: delay,
  });
  return { runtime, client, credentials, output, dataDir };
}

describe("generation lifecycle", () => {
  it("emits accepted, submitted, completed with deterministic fake output", async () => {
    // Assigned after the callback is created; the callback runs only after setup.
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const client: FakeClient = { poll: vi.fn(async () => job), event: vi.fn(async (_credential: string, event: AgentEvent) => { if (event.type === "generation.completed") runtime.stop(); }) };
    ({ runtime } = await makeRuntime({ client }));
    await runtime.run();
    expect(client.event.mock.calls.map((call) => call[1].type)).toEqual(["hello", "generation.accepted", "generation.submitted", "generation.completed"]);
    expect(client.event.mock.calls[3][1]).toMatchObject({ response: "Fake Gemini response for request request-1", remoteConversationId: "fake-request-1" });
  });

  it("reports failed before submit and ambiguous after submit", async () => {
    for (const [failure, expected] of [["before_submit", "generation.failed"], ["after_submit", "generation.ambiguous"]] as const) {
      // eslint-disable-next-line prefer-const
      let runtime!: PersonalAgentRuntime;
      const client: FakeClient = { poll: vi.fn(async () => job), event: vi.fn(async (_credential: string, event: AgentEvent) => { if (event.type === expected) runtime.stop(); }) };
      ({ runtime } = await makeRuntime({ client, adapter: new FakeGeminiAdapter(failure) }));
      await runtime.run();
      expect(client.event.mock.calls.map((call) => call[1].type)).toContain(expected);
    }
  });

  it("does not log credential, prompt, or response content", async () => {
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const setup = await makeRuntime({ client: { poll: vi.fn(async () => job), event: vi.fn(async (_credential: string, event: AgentEvent) => { if (event.type === "generation.completed") runtime.stop(); }) } });
    runtime = setup.runtime;
    await runtime.run();
    const logs = setup.output.lines.join(" ");
    expect(logs).not.toContain(CREDENTIAL);
    expect(logs).not.toContain(job.prompt);
    expect(logs).not.toContain("Fake Gemini response");
  });

  it("ignores a duplicate request while it is executing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const adapter = new FakeGeminiAdapter();
    const execute = vi.spyOn(adapter, "execute").mockImplementation(async (nextJob, callbacks) => { await gate; return FakeGeminiAdapter.prototype.execute.call(adapter, nextJob, callbacks); });
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const client: FakeClient = { poll: vi.fn(async () => job), event: vi.fn(async (_credential: string, event: AgentEvent) => { if (event.type === "generation.completed") runtime.stop(); }) };
    ({ runtime } = await makeRuntime({ client, adapter }));
    const running = runtime.run();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    await runtime.handleJob(job);
    release();
    await running;
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("reconnect, recovery, and shutdown", () => {
  it("backs off after a disconnect and resumes polling", async () => {
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const sleeps: number[] = [];
    const client: FakeClient = { poll: vi.fn().mockRejectedValueOnce(new AgentHttpError("network_error", true)).mockImplementationOnce(async () => { runtime.stop(); return null; }), event: vi.fn(async () => undefined) };
    const setup = await makeRuntime({ client });
    runtime = new PersonalAgentRuntime({ config: config(setup.dataDir), client: client as unknown as PersonalAgentHttpClient, credentialStore: setup.credentials.store,
      journal: new ExecutionJournal(join(setup.dataDir, "journal-2.json")), adapter: new FakeGeminiAdapter(), logger: setup.output.logger,
      backoff: new ExponentialBackoff(100, 100, () => 0), sleep: async (ms, signal) => {
        if (ms === 300_000) return delay(ms, signal);
        sleeps.push(ms);
      } });
    await runtime.run();
    expect(client.poll).toHaveBeenCalledTimes(2);
    expect(sleeps).toContain(50);
  });

  it("deletes a rejected credential and enters unpaired state", async () => {
    const setup = await makeRuntime({ client: { poll: vi.fn(async () => { throw new AgentHttpError("unauthorized", false); }), event: vi.fn(async () => undefined) } });
    expect(await setup.runtime.run()).toBe("unpaired");
    expect(setup.credentials.store.delete).toHaveBeenCalled();
  });

  it("recovers submitted work as ambiguous without executing it", async () => {
    const dataDir = await temporaryDirectory();
    const prior = new ExecutionJournal(join(dataDir, "journal.json"));
    await prior.set(job.requestId, "submitted");
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const adapter = new FakeGeminiAdapter();
    const execute = vi.spyOn(adapter, "execute");
    const client: FakeClient = { poll: vi.fn(async () => { runtime.stop(); return null; }), event: vi.fn(async () => undefined) };
    ({ runtime } = await makeRuntime({ client, adapter, dataDir }));
    await runtime.run();
    expect(client.event.mock.calls.map((call) => call[1].type)).toContain("generation.ambiguous");
    expect(execute).not.toHaveBeenCalled();
  });

  it("retries failed startup recovery on redelivery without executing", async () => {
    const dataDir = await temporaryDirectory();
    const prior = new ExecutionJournal(join(dataDir, "journal.json"));
    await prior.set(job.requestId, "submitted");
    let ambiguousAttempts = 0;
    // eslint-disable-next-line prefer-const
    let runtime!: PersonalAgentRuntime;
    const adapter = new FakeGeminiAdapter();
    const execute = vi.spyOn(adapter, "execute");
    const client: FakeClient = {
      poll: vi.fn(async () => job),
      event: vi.fn(async (_credential: string, event: AgentEvent) => {
        if (event.type !== "generation.ambiguous") return;
        ambiguousAttempts += 1;
        if (ambiguousAttempts === 1) throw new AgentHttpError("network_error", true);
        runtime.stop();
      }),
    };
    ({ runtime } = await makeRuntime({ client, adapter, dataDir }));
    await runtime.run();
    expect(ambiguousAttempts).toBe(2);
    expect(execute).not.toHaveBeenCalled();
    await vi.waitFor(async () => {
      const persisted = new ExecutionJournal(join(dataDir, "journal.json"));
      await persisted.load();
      expect(persisted.get(job.requestId)).toBeUndefined();
    });
  });

  it("retains submitted protection after a lost response and allows later recovery", async () => {
    const dataDir = await temporaryDirectory();
    let polls = 0;
    // eslint-disable-next-line prefer-const
    let firstRuntime!: PersonalAgentRuntime;
    const firstAdapter = new FakeGeminiAdapter();
    const firstExecute = vi.spyOn(firstAdapter, "execute");
    const firstClient: FakeClient = {
      poll: vi.fn(async () => { polls += 1; if (polls === 1) return job; firstRuntime.stop(); return null; }),
      event: vi.fn(async (_credential: string, event: AgentEvent) => {
        if (event.type === "generation.submitted" || event.type === "generation.ambiguous") throw new AgentHttpError("network_error", true);
      }),
    };
    ({ runtime: firstRuntime } = await makeRuntime({ client: firstClient, adapter: firstAdapter, dataDir }));
    await firstRuntime.run();
    const retained = new ExecutionJournal(join(dataDir, "journal.json"));
    await retained.load();
    expect(retained.get(job.requestId)).toBe("submitted");
    expect(firstExecute).toHaveBeenCalledTimes(1);

    // eslint-disable-next-line prefer-const
    let secondRuntime!: PersonalAgentRuntime;
    const secondAdapter = new FakeGeminiAdapter();
    const secondExecute = vi.spyOn(secondAdapter, "execute");
    const secondClient: FakeClient = { poll: vi.fn(async () => { secondRuntime.stop(); return null; }), event: vi.fn(async () => undefined) };
    ({ runtime: secondRuntime } = await makeRuntime({ client: secondClient, adapter: secondAdapter, dataDir }));
    await secondRuntime.run();
    expect(secondClient.event.mock.calls.map((call) => call[1].type)).toContain("generation.ambiguous");
    expect(secondExecute).not.toHaveBeenCalled();
  });

  it("keeps submitted state and never emits failed when shutdown occurs after submit", async () => {
    const dataDir = await temporaryDirectory();
    let release!: () => void;
    let submitted!: () => void;
    const submittedGate = new Promise<void>((resolve) => { submitted = resolve; });
    const executionGate = new Promise<void>((resolve) => { release = resolve; });
    const adapter: PersonalProviderAdapter = {
      provider: "google",
      getStatus: async () => "ready",
      execute: async (nextJob, callbacks) => {
        await callbacks.submitted();
        submitted();
        await executionGate;
        return { remoteConversationId: `fake-${nextJob.requestId}`, response: "not logged" };
      },
    };
    const client: FakeClient = { poll: vi.fn(async () => job), event: vi.fn(async (_credential: string, event: AgentEvent, signal?: AbortSignal) => {
      if (signal?.aborted && (event.type === "generation.completed" || event.type === "generation.ambiguous")) throw new AgentHttpError("network_error", true);
    }) };
    const setup = await makeRuntime({ client, adapter, dataDir });
    const running = setup.runtime.run();
    await submittedGate;
    setup.runtime.stop();
    const journal = new ExecutionJournal(join(dataDir, "journal.json"));
    await journal.load();
    expect(journal.get(job.requestId)).toBe("submitted");
    expect(client.event.mock.calls.map((call) => call[1].type)).not.toContain("generation.failed");
    await expect(running).resolves.toBe("stopped");
    expect(client.event.mock.calls.map((call) => call[1].type)).not.toContain("generation.failed");
    const afterShutdown = new ExecutionJournal(join(dataDir, "journal.json"));
    await afterShutdown.load();
    expect(afterShutdown.get(job.requestId)).toBe("submitted");
    release();
    await vi.waitFor(() => expect(setup.output.lines.join(" ")).toContain("terminal event pending"));
  });

  it("stops an outstanding long poll cleanly", async () => {
    let observedSignal: AbortSignal | undefined;
    const client: FakeClient = { poll: vi.fn(async (_credential, _wait, signal) => { observedSignal = signal; await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })); return null; }), event: vi.fn(async () => undefined) };
    const setup = await makeRuntime({ client });
    const running = setup.runtime.run();
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    setup.runtime.stop();
    await expect(running).resolves.toBe("stopped");
    expect(observedSignal?.aborted).toBe(true);
  });
});
