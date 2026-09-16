import { chromium, type Browser, type Locator, type Page } from "playwright-core";

export const GEMINI_ORIGIN = "https://gemini.google.com";
export const GEMINI_FRESH_URL = `${GEMINI_ORIGIN}/app`;

export type ResponseBaseline = { count: number; lastText: string };
export type GenerationStartEvidence = "stop_control" | "response_appended" | "response_mutated";
export type ExpectedConversation = { kind: "mapped"; id: string } | { kind: "fresh" };
export type GenerationStart = { evidence: GenerationStartEvidence; conversationId: string | null };
export type CompletedResponse = { response: string; conversationId: string };

export interface GeminiPage {
  url(): string;
  navigate(url: string): Promise<void>;
  waitForHydration(timeoutMs: number, requireHistory: boolean): Promise<ResponseBaseline>;
  isSignedOut(): Promise<boolean>;
  composerCount(): Promise<number>;
  fillComposerIfEmpty(prompt: string): Promise<"filled" | "not_empty">;
  composerStillEquals(prompt: string): Promise<boolean>;
  clickSend(): Promise<void>;
  waitForGenerationStart(baseline: ResponseBaseline, expected: ExpectedConversation, timeoutMs: number): Promise<GenerationStart>;
  waitForCompletedResponse(baseline: ResponseBaseline, start: GenerationStart, expected: ExpectedConversation, timeoutMs: number): Promise<CompletedResponse>;
}

export interface GeminiBrowserConnection {
  isConnected(): boolean;
  geminiPages(): GeminiPage[];
  createGeminiPage(): Promise<GeminiPage>;
}

export interface GeminiBrowserConnector {
  connect(endpoint: string): Promise<GeminiBrowserConnection>;
}

const COMPOSER_SELECTOR = [
  "rich-textarea [contenteditable='true']",
  ".ql-editor[contenteditable='true']",
  "[contenteditable='true'][role='textbox'][aria-label*='prompt' i]",
].join(", ");
const RESPONSE_SELECTOR = "model-response";
const RESPONSE_CONTENT_SELECTOR = ".markdown, message-content";

class PlaywrightGeminiPage implements GeminiPage {
  constructor(private readonly page: Page) {}

  url() { return this.page.url(); }
  async navigate(url: string) {
    assertGeminiUrl(url);
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }
  async isSignedOut() {
    const signIn = this.page.getByRole("link", { name: /^sign in$/i })
      .or(this.page.getByRole("button", { name: /^sign in$/i }));
    return signIn.first().isVisible().catch(() => false);
  }
  async composerCount() {
    const candidates = this.page.locator(COMPOSER_SELECTOR);
    const count = await candidates.count();
    let visible = 0;
    for (let index = 0; index < count; index += 1) {
      if (await candidates.nth(index).isVisible().catch(() => false)) visible += 1;
    }
    return visible;
  }
  async waitForHydration(timeoutMs: number, requireHistory: boolean) {
    const deadline = Date.now() + timeoutMs;
    let priorCount = -1;
    let priorLastText = "";
    let stableSince = Date.now();
    while (Date.now() < deadline) {
      if (await this.isSignedOut()) return { count: 0, lastText: "" };
      const composerCount = await this.composerCount();
      const responses = this.page.locator(RESPONSE_SELECTOR);
      const count = await responses.count();
      const lastText = count ? await responseText(responses.nth(count - 1)) : "";
      if (baselineSnapshotChanged(priorCount, priorLastText, count, lastText)) {
        priorCount = count;
        priorLastText = lastText;
        stableSince = Date.now();
      }
      if (requireHistory && await this.stopControl().isVisible().catch(() => false)) throw new Error("generation_active");
      if (composerCount > 0 && (!requireHistory || count > 0) && Date.now() - stableSince >= 1_000) {
        return { count, lastText };
      }
      await this.page.waitForTimeout(100);
    }
    throw new Error("hydration_timeout");
  }
  private composer(): Locator { return this.page.locator(COMPOSER_SELECTOR).filter({ visible: true }); }
  async fillComposerIfEmpty(prompt: string) {
    return this.composer().evaluate(atomicFillComposer, prompt);
  }
  async composerStillEquals(prompt: string) { return normalizeEditorText(await this.composer().innerText()) === normalizeEditorText(prompt); }
  private composerArea() {
    return this.composer().locator("xpath=ancestor::*[.//button[@aria-label='Send' or @aria-label='Send message' or @aria-label='Send prompt']][1]");
  }
  private stopControl() { return this.composerArea().getByRole("button", { name: /^stop( response| generating)?$/i }); }
  async clickSend() {
    const send = this.composerArea().getByRole("button", { name: /^send( message| prompt)?$/i });
    if (await send.count() !== 1 || !await send.isVisible() || await send.isDisabled()) throw new Error("send_unavailable");
    await send.click({ timeout: 5_000, noWaitAfter: true });
  }
  async waitForGenerationStart(baseline: ResponseBaseline, expected: ExpectedConversation, timeoutMs: number): Promise<GenerationStart> {
    const stop = this.stopControl();
    const identity = new ConversationIdentityPin(expected);
    const responses = this.page.locator(RESPONSE_SELECTOR);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pinnedId = identity.observe(this.page.url());
      if (await stop.isVisible().catch(() => false)) return { evidence: "stop_control", conversationId: pinnedId };
      const count = await responses.count();
      if (count > baseline.count) return { evidence: "response_appended", conversationId: pinnedId };
      const lastText = count ? await responseText(responses.last()) : "";
      if (count === baseline.count && lastText !== baseline.lastText) return { evidence: "response_mutated", conversationId: pinnedId };
      await this.page.waitForTimeout(100);
    }
    throw new Error("generation_start_timeout");
  }
  async waitForCompletedResponse(baseline: ResponseBaseline, start: GenerationStart, expected: ExpectedConversation, timeoutMs: number) {
    const responses = this.page.locator(RESPONSE_SELECTOR);
    const stop = this.stopControl();
    const deadline = Date.now() + timeoutMs;
    let last = "";
    let stableSince = Date.now();
    const identity = new ConversationIdentityPin(expected, start.conversationId);
    let pinnedId: string | null = start.conversationId;
    while (Date.now() < deadline) {
      pinnedId = identity.observe(this.page.url());
      const count = await responses.count();
      const appended = count > baseline.count;
      const candidate = appended ? responses.nth(baseline.count) : responses.last();
      const candidateText = count ? await responseText(candidate) : "";
      const distinguished = responseBelongsToGeneration(appended, start.evidence, candidateText, baseline.lastText);
      const text = distinguished ? candidateText : "";
      if (text !== last) { last = text; stableSince = Date.now(); }
      if (pinnedId && distinguished && text && !await stop.isVisible().catch(() => false) && Date.now() - stableSince >= 1_500) {
        return { response: text, conversationId: pinnedId };
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error("response_timeout");
  }
}

async function responseText(response: Locator): Promise<string> {
  const blocks = await response.locator(RESPONSE_CONTENT_SELECTOR).evaluateAll(
    (elements, selector) => elements.filter((element) => !element.querySelector(selector as string))
      .map((element) => (element as HTMLElement).innerText.trim()).filter(Boolean), RESPONSE_CONTENT_SELECTOR,
  ).catch(() => [] as string[]);
  return blocks.join("\n").trim();
}

export function responseTextBlocks(elements: Element[], selector = RESPONSE_CONTENT_SELECTOR): string[] {
  return elements.filter((element) => !element.querySelector(selector))
    .map((element) => (element as HTMLElement).innerText.trim()).filter(Boolean);
}

export function responseBelongsToGeneration(appended: boolean, evidence: GenerationStartEvidence, candidateText: string, baselineText: string): boolean {
  return appended || (evidence === "stop_control" && candidateText !== baselineText);
}

export function baselineSnapshotChanged(priorCount: number, priorText: string, count: number, text: string): boolean {
  return count !== priorCount || text !== priorText;
}

export function atomicFillComposer(element: Element, opaquePrompt: string): "filled" | "not_empty" {
  if ((element.textContent ?? "") !== "") return "not_empty";
  const paragraph = element.firstElementChild;
  const lineBreak = paragraph?.firstElementChild;
  const canonicalQuillScaffold = element.childNodes.length === 1 && paragraph?.localName === "p" && paragraph.attributes.length === 0 &&
    paragraph.childNodes.length === 1 && lineBreak?.localName === "br" && lineBreak.attributes.length === 0 && lineBreak.childNodes.length === 0;
  if (element.childNodes.length !== 0 && !canonicalQuillScaffold) return "not_empty";
  (element as HTMLElement).focus();
  element.textContent = opaquePrompt;
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: opaquePrompt, inputType: "insertText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return "filled";
}

export class ConversationIdentityPin {
  private pinnedId: string | null;
  constructor(private readonly expected: ExpectedConversation, initialId: string | null = null) {
    this.pinnedId = expected.kind === "mapped" ? expected.id : initialId;
  }
  observe(url: string): string | null {
    const parsed = new URL(url);
    const currentId = pageConversationId(url);
    if (parsed.origin !== GEMINI_ORIGIN || (parsed.pathname !== "/app" && currentId === null)) throw new Error("conversation_changed");
    if (this.expected.kind === "mapped" && currentId !== this.expected.id) throw new Error("conversation_changed");
    if (this.expected.kind === "fresh" && currentId) {
      if (this.pinnedId && currentId !== this.pinnedId) throw new Error("conversation_changed");
      this.pinnedId ??= currentId;
    } else if (this.expected.kind === "fresh" && this.pinnedId) throw new Error("conversation_changed");
    return this.pinnedId;
  }
}

function pageConversationId(value: string): string | null {
  const url = new URL(value);
  if (url.origin !== GEMINI_ORIGIN) return null;
  return /^\/app\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] ?? null;
}

function assertGeminiUrl(value: string): void {
  const url = new URL(value);
  if (url.origin !== GEMINI_ORIGIN || (url.pathname !== "/app" && !url.pathname.startsWith("/app/"))) throw new Error("navigation_forbidden");
}

function normalizeEditorText(value: string): string { return value.replace(/\r\n/g, "\n"); }

export function isGeminiPageUrl(value: string): boolean {
  try { return new URL(value).origin === GEMINI_ORIGIN; } catch { return false; }
}

class PlaywrightConnection implements GeminiBrowserConnection {
  constructor(private readonly browser: Browser) {}
  isConnected() { return this.browser.isConnected(); }
  geminiPages() {
    return this.browser.contexts().flatMap((context) => context.pages())
      .filter((page) => isGeminiPageUrl(page.url()))
      .map((page) => new PlaywrightGeminiPage(page));
  }
  async createGeminiPage() {
    const context = this.browser.contexts()[0];
    if (!context) throw new Error("browser_context_unavailable");
    const page = await context.newPage();
    await page.goto(GEMINI_FRESH_URL, { waitUntil: "domcontentloaded" });
    return new PlaywrightGeminiPage(page);
  }
}

export const playwrightGeminiConnector: GeminiBrowserConnector = {
  async connect(endpoint) { return new PlaywrightConnection(await chromium.connectOverCDP(endpoint)); },
};
