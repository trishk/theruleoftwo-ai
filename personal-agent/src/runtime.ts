import { ExponentialBackoff, delay } from "./backoff.js";
import { normalizeOrigin, type AgentConfig } from "./config.js";
import type { CredentialStore } from "./credential-store.js";
import { AgentHttpError, type PersonalAgentHttpClient } from "./http-client.js";
import type { ExecutionJournal } from "./journal.js";
import type { Logger } from "./logger.js";
import { credentialAgentId, credentialFingerprint } from "./pairing.js";
import { PROTOCOL_VERSION, type AgentEvent, type GenerationJob, type PersonalProviderAdapter } from "./types.js";

type RuntimeDependencies = {
  config: AgentConfig;
  client: PersonalAgentHttpClient;
  credentialStore: CredentialStore;
  journal: ExecutionJournal;
  adapter: PersonalProviderAdapter;
  logger: Logger;
  backoff?: ExponentialBackoff;
  sleep?: typeof delay;
};

export class PersonalAgentRuntime {
  private readonly controller = new AbortController();
  private readonly processing = new Set<string>();
  private readonly backoff: ExponentialBackoff;
  private readonly sleep: typeof delay;
  private credential: string | null = null;

  constructor(private readonly dependencies: RuntimeDependencies) {
    this.backoff = dependencies.backoff ?? new ExponentialBackoff();
    this.sleep = dependencies.sleep ?? delay;
  }

  stop(): void { this.controller.abort(); }

  async run(): Promise<"stopped" | "unpaired"> {
    const { credentialStore, journal, logger, config } = this.dependencies;
    if (!config.metadata || normalizeOrigin(config.metadata.origin) !== normalizeOrigin(config.baseUrl)) throw new Error("paired_origin_mismatch");
    this.credential = await credentialStore.get();
    if (!this.credential) { logger.error("Agent is not paired. Run the pair command first."); return "unpaired"; }
    if (!config.metadata || credentialFingerprint(this.credential) !== config.metadata.credentialFingerprint ||
        credentialAgentId(this.credential) !== config.metadata.agentId) {
      this.credential = null;
      throw new Error("paired_state_mismatch");
    }
    await journal.load();
    logger.info(`Starting Personal Agent for ${new URL(config.baseUrl).hostname}.`);
    try {
      await this.sendHello();
      await this.recoverJournal();
      const heartbeat = this.heartbeatLoop();
      await this.pollLoop();
      this.stop();
      await heartbeat;
      return "stopped";
    } catch (error) {
      if (error instanceof AgentHttpError && error.code === "unauthorized") {
        await credentialStore.delete();
        logger.error("Agent credential was revoked or rejected; pair again.");
        return "unpaired";
      }
      if (this.controller.signal.aborted) return "stopped";
      throw error;
    }
  }

  private async sendHello() {
    const status = await this.dependencies.adapter.getStatus();
    await this.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, adapter: { provider: "google", kind: "gemini_personal", status } });
    this.dependencies.logger.info("Agent online.");
  }

  private async recoverJournal() {
    for (const [requestId, phase] of this.dependencies.journal.all()) {
      try {
        await this.recoverRequest(requestId, phase);
      } catch (error) {
        if (error instanceof AgentHttpError && error.code === "unauthorized") throw error;
        this.dependencies.logger.error(`Job ${requestId}: recovery needed (${errorCode(error)}).`);
      }
    }
  }

  private async heartbeatLoop(): Promise<void> {
    while (!this.controller.signal.aborted) {
      await this.sleep(this.dependencies.config.heartbeatMs, this.controller.signal);
      if (this.controller.signal.aborted) break;
      try {
        const status = await this.dependencies.adapter.getStatus();
        await this.send({ type: "heartbeat", protocolVersion: 1, adapterStatus: status });
      } catch (error) {
        if (error instanceof AgentHttpError && error.code === "unauthorized") { this.stop(); throw error; }
        this.dependencies.logger.error(`Heartbeat failed (${errorCode(error)}).`);
      }
    }
  }

  private async pollLoop(): Promise<void> {
    let disconnected = false;
    while (!this.controller.signal.aborted) {
      try {
        const job = await this.dependencies.client.poll(this.requiredCredential(), this.dependencies.config.pollWaitMs, this.controller.signal);
        this.backoff.reset();
        if (disconnected) {
          this.dependencies.logger.info("Connection restored.");
          disconnected = false;
        }
        if (job) await raceWithAbort(this.handleJob(job), this.controller.signal);
      } catch (error) {
        if (this.controller.signal.aborted) break;
        if (error instanceof AgentHttpError && error.code === "unauthorized") throw error;
        const waitMs = this.backoff.next();
        disconnected = true;
        this.dependencies.logger.error(`Disconnected (${errorCode(error)}); retrying in ${waitMs}ms.`);
        await this.sleep(waitMs, this.controller.signal);
      }
    }
  }

  async handleJob(job: GenerationJob): Promise<void> {
    const { journal, logger, adapter } = this.dependencies;
    if (this.processing.has(job.requestId)) {
      logger.info(`Duplicate job ${job.requestId} ignored.`);
      return;
    }
    const priorPhase = journal.get(job.requestId);
    if (priorPhase) {
      await this.recoverRequest(job.requestId, priorPhase);
      return;
    }
    this.processing.add(job.requestId);
    let submitted = false;
    try {
      await journal.set(job.requestId, "received");
      await this.send({ type: "generation.accepted", protocolVersion: 1, requestId: job.requestId });
      await journal.set(job.requestId, "accepted");
      logger.info(`Job ${job.requestId}: generation.accepted.`);
      const result = await adapter.execute(job, {
        submitted: async () => {
          submitted = true;
          await journal.set(job.requestId, "submitted");
          await this.send({ type: "generation.submitted", protocolVersion: 1, requestId: job.requestId });
          logger.info(`Job ${job.requestId}: generation.submitted.`);
        },
      });
      await this.send({ type: "generation.completed", protocolVersion: 1, requestId: job.requestId, ...result });
      logger.info(`Job ${job.requestId}: generation.completed.`);
      await journal.delete(job.requestId);
    } catch (error) {
      const terminal: AgentEvent = submitted
        ? { type: "generation.ambiguous", protocolVersion: 1, requestId: job.requestId }
        : { type: "generation.failed", protocolVersion: 1, requestId: job.requestId, errorCode: "automation_changed" };
      try {
        await this.send(terminal);
        logger.error(`Job ${job.requestId}: ${terminal.type} (${errorCode(error)}).`);
        await journal.delete(job.requestId);
      } catch (reportError) {
        logger.error(`Job ${job.requestId}: terminal event pending (${errorCode(reportError)}).`);
      }
    } finally {
      this.processing.delete(job.requestId);
    }
  }

  private send(event: AgentEvent) { return this.dependencies.client.event(this.requiredCredential(), event, this.controller.signal); }
  private async recoverRequest(requestId: string, phase: "received" | "accepted" | "submitted") {
    const event: AgentEvent = phase === "submitted"
      ? { type: "generation.ambiguous", protocolVersion: 1, requestId }
      : { type: "generation.failed", protocolVersion: 1, requestId, errorCode: "response_timeout_before_submit" };
    this.dependencies.logger.info(`Recovering job ${requestId} as ${event.type}.`);
    await this.send(event);
    await this.dependencies.journal.delete(requestId);
  }
  private requiredCredential() { if (!this.credential) throw new Error("credential_unavailable"); return this.credential; }
}

async function raceWithAbort(operation: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  let resolveStop!: () => void;
  const stopped = new Promise<void>((resolve) => { resolveStop = resolve; });
  signal.addEventListener("abort", resolveStop, { once: true });
  try {
    const result = await Promise.race([operation.then(() => "completed" as const), stopped.then(() => "stopped" as const)]);
    if (result === "stopped") await Promise.race([operation, shortGracePeriod(50)]);
  }
  finally { signal.removeEventListener("abort", resolveStop); }
}

function shortGracePeriod(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error: unknown): string {
  if (error instanceof AgentHttpError) return error.code;
  if (error instanceof Error && /^fake_(before|after)_submit$/.test(error.message)) return "adapter_failure";
  return "runtime_error";
}
