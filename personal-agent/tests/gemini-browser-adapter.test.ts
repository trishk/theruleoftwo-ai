// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { normalizeLoopbackCdpEndpoint } from "../src/config.js";
import { GeminiBrowserAdapter, conversationId } from "../src/gemini-browser-adapter.js";
import { isGeminiPageUrl, type GeminiBrowserConnection, type GeminiBrowserConnector, type GeminiPage, type ResponseBaseline } from "../src/gemini-browser-driver.js";
import { AdapterExecutionError, type AdapterCallbacks, type GenerationJob } from "../src/types.js";

const baseline = { count: 1, lastText: "old response" };
const job: GenerationJob = { type: "generation.request", protocolVersion: 1, provider: "google", requestId: "request-1", remoteConversationId: "existing_1", prompt: "PRIVATE PROMPT" };

class FakePage implements GeminiPage {
  currentUrl = "https://gemini.google.com/app/existing_1";
  signedOut = false;
  composers = 1;
  composer = "";
  response = "new response";
  startError: Error | null = null;
  completionError: Error | null = null;
  navigateError: Error | null = null;
  navigate = vi.fn(async (url: string) => { if (this.navigateError) throw this.navigateError; this.currentUrl = url; });
  waitForHydration = vi.fn(async (): Promise<ResponseBaseline> => baseline);
  isSignedOut = vi.fn(async () => this.signedOut);
  composerCount = vi.fn(async () => this.composers);
  fillComposerIfEmpty = vi.fn(async (prompt: string) => {
    if (this.composer !== "") return "not_empty" as const;
    this.composer = prompt;
    return "filled" as const;
  });
  composerStillEquals = vi.fn(async (prompt: string) => this.composer === prompt);
  clickSend = vi.fn(async () => undefined);
  waitForGenerationStart = vi.fn(async () => { if (this.startError) throw this.startError; return { evidence: "response_appended" as const, conversationId: this.currentUrl === "https://gemini.google.com/app" ? null : this.currentUrl.split("/").at(-1) ?? null }; });
  waitForCompletedResponse = vi.fn(async () => {
    if (this.completionError) throw this.completionError;
    return { response: this.response, conversationId: this.currentUrl.split("/").at(-1) ?? "" };
  });
  url() { return this.currentUrl; }
}

function adapterCallbacks(submitted = vi.fn(async () => undefined)): AdapterCallbacks {
  return { sendAttempted: vi.fn(async () => undefined), submitted };
}

function setup(page = new FakePage(), urls: string[] = [page.currentUrl]) {
  const pages = urls.map((url, index) => index === 0 ? page : Object.assign(new FakePage(), { currentUrl: url }));
  const connection: GeminiBrowserConnection = {
    isConnected: () => true,
    geminiPages: () => pages,
    createGeminiPage: vi.fn(async () => page),
  };
  const connector: GeminiBrowserConnector = { connect: vi.fn(async () => connection) };
  const adapter = new GeminiBrowserAdapter({ geminiCdpEndpoint: "http://127.0.0.1:9222", geminiHydrationTimeoutMs: 10, geminiResponseTimeoutMs: 10 }, connector);
  return { adapter, page, connector, connection };
}

describe("Gemini CDP configuration and target isolation", () => {
  it.each(["http://127.0.0.1:9222", "http://localhost:9222", "http://[::1]:9222"])("accepts loopback endpoint %s", (value) => expect(normalizeLoopbackCdpEndpoint(value)).toBe(value));
  it.each(["http://192.168.1.2:9222", "http://example.com:9222", "https://127.0.0.1:9222", "http://127.0.0.1:9222/json", "http://user:pass@127.0.0.1:9222"])("rejects endpoint %s", (value) => expect(() => normalizeLoopbackCdpEndpoint(value)).toThrow("invalid_cdp_endpoint"));
  it("ignores unrelated targets supplied by the browser boundary", async () => {
    expect(["https://mail.google.com/mail/u/0", "chrome://settings", "https://example.test"].filter(isGeminiPageUrl)).toEqual([]);
    expect(["https://gemini.google.com/app/a", "https://mail.google.com"].filter(isGeminiPageUrl)).toEqual(["https://gemini.google.com/app/a"]);
    const { adapter } = setup();
    await expect(adapter.getStatus()).resolves.toBe("ready");
  });
  it("refuses multiple Gemini targets", async () => {
    const { adapter } = setup(new FakePage(), ["https://gemini.google.com/app/a", "https://gemini.google.com/app/b"]);
    await expect(adapter.getStatus()).resolves.toBe("gemini_unavailable");
  });
});

describe("Gemini status", () => {
  it("maps unreachable CDP to chrome_unavailable", async () => {
    const connector: GeminiBrowserConnector = { connect: vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }) };
    const adapter = new GeminiBrowserAdapter({ geminiCdpEndpoint: "http://127.0.0.1:9222", geminiHydrationTimeoutMs: 10, geminiResponseTimeoutMs: 10 }, connector);
    await expect(adapter.getStatus()).resolves.toBe("chrome_unavailable");
  });
  it("distinguishes sign-in, ready, and missing composer", async () => {
    const signedOut = setup(); signedOut.page.signedOut = true;
    await expect(signedOut.adapter.getStatus()).resolves.toBe("sign_in_required");
    const ready = setup(); await expect(ready.adapter.getStatus()).resolves.toBe("ready");
    const changed = setup(); changed.page.composers = 0;
    await expect(changed.adapter.getStatus()).resolves.toBe("gemini_unavailable");
  });
});

describe("Gemini execution lifecycle", () => {
  it("opens the exact conversation, submits once after start evidence, and returns only the new response", async () => {
    const { adapter, page } = setup();
    const submitted = vi.fn(async () => undefined);
    const callbacks = adapterCallbacks(submitted);
    await expect(adapter.execute(job, callbacks)).resolves.toEqual({ remoteConversationId: "existing_1", response: "new response" });
    expect(page.navigate).toHaveBeenCalledWith("https://gemini.google.com/app/existing_1");
    expect(page.waitForCompletedResponse).toHaveBeenCalledWith(baseline, { evidence: "response_appended", conversationId: "existing_1" }, { kind: "mapped", id: "existing_1" }, 10);
    expect(page.fillComposerIfEmpty).toHaveBeenCalledWith(job.prompt);
    expect(page.clickSend).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(callbacks.sendAttempted).toHaveBeenCalledTimes(1);
    expect(callbacks.sendAttempted.mock.invocationCallOrder[0]).toBeLessThan(page.clickSend.mock.invocationCallOrder[0]);
    expect(page.clickSend.mock.invocationCallOrder[0]).toBeLessThan(submitted.mock.invocationCallOrder[0]);
    expect(page.waitForGenerationStart.mock.invocationCallOrder[0]).toBeLessThan(submitted.mock.invocationCallOrder[0]);
  });
  it("never overwrites existing user content", async () => {
    const { adapter, page } = setup(); page.composer = "user draft";
    const callbacks = adapterCallbacks();
    await expect(adapter.execute(job, callbacks)).rejects.toMatchObject({ code: "automation_changed", possiblySubmitted: false });
    expect(page.composer).toBe("user draft");
    expect(callbacks.sendAttempted).not.toHaveBeenCalled();
    expect(page.clickSend).not.toHaveBeenCalled();
  });
  it("uses one atomic check-and-fill operation", async () => {
    const { adapter, page } = setup();
    await adapter.execute(job, adapterCallbacks());
    expect(page.fillComposerIfEmpty).toHaveBeenCalledTimes(1);
    expect(page.composer).toBe(job.prompt);
  });
  it("does not click when the durable send-attempted checkpoint fails", async () => {
    const { adapter, page } = setup();
    const callbacks = adapterCallbacks();
    vi.mocked(callbacks.sendAttempted).mockRejectedValue(new Error("journal write failed"));
    await expect(adapter.execute(job, callbacks)).rejects.toMatchObject({ possiblySubmitted: false });
    expect(page.clickSend).not.toHaveBeenCalled();
  });
  it("does not click when the user changes the composer after fill", async () => {
    const { adapter, page } = setup();
    page.composerStillEquals.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(adapter.execute(job, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: false });
    expect(page.clickSend).not.toHaveBeenCalled();
  });
  it("marks any uncertainty after invoking Send as possibly submitted and never retries", async () => {
    const { adapter, page } = setup(); page.startError = new Error("timeout");
    await expect(adapter.execute(job, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: true });
    expect(page.clickSend).toHaveBeenCalledTimes(1);
  });
  it("invokes a throwing Send exactly once and marks it ambiguous", async () => {
    const { adapter, page } = setup();
    page.clickSend.mockRejectedValue(new Error("click uncertain"));
    await expect(adapter.execute(job, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: true });
    expect(page.clickSend).toHaveBeenCalledTimes(1);
  });
  it("marks completion failure and conversation changes after submit as ambiguous", async () => {
    const first = setup(); first.page.completionError = new Error("timeout");
    await expect(first.adapter.execute(job, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: true });
    const second = setup(); second.page.waitForCompletedResponse.mockImplementation(async () => { throw new Error("conversation_changed"); });
    await expect(second.adapter.execute(job, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: true });
  });
  it("sanitizes raw driver errors before exposing them", async () => {
    const { adapter, page } = setup();
    page.completionError = new Error("SECRET_PAGE_TEXT_123");
    const error = await adapter.execute(job, adapterCallbacks()).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(AdapterExecutionError);
    expect((error as Error).message).toBe("automation_changed");
    expect((error as Error).message).not.toContain("SECRET_PAGE_TEXT_123");
  });
  it("fails closed when an exact conversation cannot be reopened", async () => {
    const { adapter, page } = setup(); page.navigate.mockImplementation(async () => { page.currentUrl = "https://gemini.google.com/app"; });
    await expect(adapter.execute(job, adapterCallbacks())).rejects.toMatchObject({ code: "conversation_not_found", possiblySubmitted: false });
    expect(page.clickSend).not.toHaveBeenCalled();
  });
  it("starts a fresh chat and returns its assigned ID", async () => {
    const { adapter, page } = setup();
    page.waitForCompletedResponse.mockImplementation(async () => ({ response: "fresh response", conversationId: "new_id" }));
    await expect(adapter.execute({ ...job, remoteConversationId: null }, adapterCallbacks())).resolves.toEqual({ remoteConversationId: "new_id", response: "fresh response" });
    expect(page.navigate).toHaveBeenCalledWith("https://gemini.google.com/app");
  });
  it("refuses a restored conversation for a fresh request before filling", async () => {
    const { adapter, page } = setup();
    page.navigate.mockImplementation(async () => { page.currentUrl = "https://gemini.google.com/app/existing123"; });
    await expect(adapter.execute({ ...job, remoteConversationId: null }, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: false });
    expect(page.fillComposerIfEmpty).not.toHaveBeenCalled();
    expect(page.clickSend).not.toHaveBeenCalled();
  });
  it("rechecks fresh identity after fill and refuses an existing conversation before Send", async () => {
    const { adapter, page } = setup();
    page.composerStillEquals.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      page.currentUrl = "https://gemini.google.com/app/existing123";
      return true;
    });
    await expect(adapter.execute({ ...job, remoteConversationId: null }, adapterCallbacks())).rejects.toMatchObject({ possiblySubmitted: false });
    expect(page.clickSend).not.toHaveBeenCalled();
  });
  it("guards against concurrent local execution", async () => {
    const { adapter, page } = setup();
    let release!: () => void;
    page.waitForCompletedResponse.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ response: "response", conversationId: "existing_1" }); }));
    const first = adapter.execute(job, adapterCallbacks());
    await vi.waitFor(() => expect(page.waitForCompletedResponse).toHaveBeenCalled());
    await expect(adapter.execute(job, adapterCallbacks())).rejects.toBeInstanceOf(AdapterExecutionError);
    release(); await first;
  });
});

it("extracts only strict Gemini conversation URLs", () => {
  expect(conversationId("https://gemini.google.com/app/abc_123-XYZ")).toBe("abc_123-XYZ");
  expect(conversationId("https://gemini.google.com/app")).toBeNull();
  expect(conversationId("https://example.test/app/abc")).toBeNull();
});
