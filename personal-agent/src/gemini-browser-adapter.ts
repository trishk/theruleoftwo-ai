import type { AgentConfig } from "./config.js";
import {
  GEMINI_FRESH_URL, GEMINI_ORIGIN, playwrightGeminiConnector,
  type GeminiBrowserConnection, type GeminiBrowserConnector, type GeminiPage,
} from "./gemini-browser-driver.js";
import { AdapterExecutionError, type AdapterCallbacks, type AdapterStatus, type GenerationJob, type PersonalProviderAdapter } from "./types.js";

const CONVERSATION_ID = /^[A-Za-z0-9_-]+$/;
const MAX_RESPONSE_CHARACTERS = 1_000_000;
class BrowserConnectionError extends Error {}

export class GeminiBrowserAdapter implements PersonalProviderAdapter {
  readonly provider = "google" as const;
  private connection: GeminiBrowserConnection | null = null;
  private executing = false;

  constructor(
    private readonly config: Pick<AgentConfig, "geminiCdpEndpoint" | "geminiHydrationTimeoutMs" | "geminiResponseTimeoutMs">,
    private readonly connector: GeminiBrowserConnector = playwrightGeminiConnector,
  ) {}

  async getStatus(): Promise<AdapterStatus> {
    try {
      const page = await this.selectPage();
      await page.waitForHydration(this.config.geminiHydrationTimeoutMs, false);
      if (await page.isSignedOut()) return "sign_in_required";
      return await page.composerCount() === 1 ? "ready" : "gemini_unavailable";
    } catch (error) {
      return isConnectionFailure(error) ? "chrome_unavailable" : "gemini_unavailable";
    }
  }

  async execute(job: GenerationJob, callbacks: AdapterCallbacks) {
    if (this.executing) throw new AdapterExecutionError("automation_changed");
    this.executing = true;
    let sendInvoked = false;
    let submitted = false;
    try {
      const page = await this.selectPage();
      await this.openConversation(page, job.remoteConversationId);
      let baseline;
      try { baseline = await page.waitForHydration(this.config.geminiHydrationTimeoutMs, job.remoteConversationId !== null); }
      catch { throw new AdapterExecutionError(job.remoteConversationId ? "conversation_not_found" : "automation_changed"); }
      await this.requireReady(page);
      this.verifyPreSendConversation(page, job.remoteConversationId);
      if (await page.fillComposerIfEmpty(job.prompt) !== "filled") throw new AdapterExecutionError("automation_changed");
      if (!await page.composerStillEquals(job.prompt)) throw new AdapterExecutionError("automation_changed");
      if (!await page.composerStillEquals(job.prompt)) throw new AdapterExecutionError("automation_changed");
      this.verifyPreSendConversation(page, job.remoteConversationId);
      try {
        const expected = job.remoteConversationId
          ? { kind: "mapped" as const, id: job.remoteConversationId }
          : { kind: "fresh" as const };
        await callbacks.sendAttempted();
        sendInvoked = true;
        await page.clickSend();
        const start = await page.waitForGenerationStart(baseline, expected, this.config.geminiHydrationTimeoutMs);
        await callbacks.submitted();
        submitted = true;
        const completed = await page.waitForCompletedResponse(baseline, start, expected, this.config.geminiResponseTimeoutMs);
        if (!completed.response || completed.response.length > MAX_RESPONSE_CHARACTERS) throw new AdapterExecutionError("automation_changed", true);
        if (job.remoteConversationId && completed.conversationId !== job.remoteConversationId) throw new AdapterExecutionError("automation_changed", true);
        return { remoteConversationId: completed.conversationId, response: completed.response };
      } catch {
        throw new AdapterExecutionError("automation_changed", sendInvoked);
      }
    } catch (error) {
      if (error instanceof AdapterExecutionError) throw error;
      throw new AdapterExecutionError(isConnectionFailure(error) ? "chrome_unavailable" : "automation_changed", sendInvoked || submitted);
    } finally {
      this.executing = false;
    }
  }

  private async connect() {
    if (!this.connection?.isConnected()) {
      try { this.connection = await this.connector.connect(this.config.geminiCdpEndpoint); }
      catch { throw new BrowserConnectionError(); }
    }
    return this.connection;
  }
  private async selectPage() {
    const connection = await this.connect();
    const pages = connection.geminiPages();
    if (pages.length > 1) throw new Error("ambiguous_gemini_targets");
    return pages[0] ?? connection.createGeminiPage();
  }
  private async openConversation(page: GeminiPage, requestedId: string | null) {
    if (requestedId !== null && !CONVERSATION_ID.test(requestedId)) throw new AdapterExecutionError("conversation_not_found");
    const destination = requestedId ? `${GEMINI_FRESH_URL}/${requestedId}` : GEMINI_FRESH_URL;
    try { await page.navigate(destination); }
    catch { throw new AdapterExecutionError(requestedId ? "conversation_not_found" : "automation_changed"); }
    if (requestedId && conversationId(page.url()) !== requestedId) throw new AdapterExecutionError("conversation_not_found");
  }
  private async requireReady(page: GeminiPage) {
    if (new URL(page.url()).origin !== GEMINI_ORIGIN || await page.isSignedOut() || await page.composerCount() !== 1) {
      throw new AdapterExecutionError("automation_changed");
    }
  }
  private verifyPreSendConversation(page: GeminiPage, requestedId: string | null) {
    const actualId = conversationId(page.url());
    const url = new URL(page.url());
    if (url.origin !== GEMINI_ORIGIN || (requestedId ? actualId !== requestedId : url.pathname !== "/app" || actualId !== null)) {
      throw new AdapterExecutionError("automation_changed");
    }
  }
}

export function conversationId(value: string): string | null {
  const url = new URL(value);
  if (url.origin !== GEMINI_ORIGIN) return null;
  const match = /^\/app\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  return match?.[1] ?? null;
}

function isConnectionFailure(error: unknown): boolean {
  if (error instanceof BrowserConnectionError) return true;
  const message = error instanceof Error ? error.message : "";
  return /ECONNREFUSED|browser.*closed|connection.*closed|Target page.*closed/i.test(message);
}
