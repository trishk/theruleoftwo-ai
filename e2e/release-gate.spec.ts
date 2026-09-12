import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import crypto from "crypto";

import {
  createE2EUser,
  deleteE2EUser,
  loginE2EUser,
  type E2EUser,
} from "./auth";
import { getE2EDatabasePath } from "./database.mjs";

const AI_TEXT = "Deterministic E2E response from TheRuleOfTwo.ai.";

async function login(page: Page, user: E2EUser) {
  await loginE2EUser(page, user.email);
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
}

async function createChat(page: Page) {
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/, { timeout: 10_000 });
}

async function send(page: Page, text: string) {
  const composer = page.getByPlaceholder("Ask for another perspective...");
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

async function configureOpenAI(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add integration" }).click();
  await page.getByLabel("API key").fill("e2e-false-provider-key");
  await page.getByRole("button", { name: "Save integration" }).click();
  await expect(page.getByText("Configured").first()).toBeVisible();
}

test("reply persists through reload and a disposable conversation can be deleted", async ({ page }) => {
  const user = await createE2EUser();
  try {
    await login(page, user);
    await createChat(page);
    const source = `reply-source-${Date.now()}`;
    const answer = `reply-answer-${Date.now()}`;
    await send(page, source);
    await page.reload();
    const sourceRow = page.locator("article", { hasText: source });
    await sourceRow.hover();
    await sourceRow.getByRole("button", { name: /^Reply to/ }).click();
    await send(page, answer);
    const answerRow = page.locator("article", { hasText: answer });
    await expect(answerRow).toContainText(source);
    await page.reload();
    await expect(page.locator("article", { hasText: answer })).toContainText(source);

    const chatLink = page.locator('a[href^="/chat/"]').first();
    const deletedChatUrl = page.url();
    await chatLink.hover();
    await chatLink.locator("xpath=..").getByRole("button", { name: "Chat options" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(chatLink).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    expect(page.url()).not.toBe(deletedChatUrl);
  } finally {
    await deleteE2EUser(user.id);
  }
});

test("safe AI mention streams, stops durably, retries, and reconciles without duplicating the source", async ({ page }) => {
  const user = await createE2EUser();
  try {
    await login(page, user);
    await configureOpenAI(page);
    await createChat(page);
    const suffix = `release-gate-${Date.now()}`;
    const source = `@ChatGPT ${suffix}`;
    const composer = page.getByPlaceholder("Ask for another perspective...");
    await page.getByRole("button", { name: "Mention an AI" }).click();
    await page.getByRole("option", { name: /ChatGPT/ }).click();
    await composer.fill(`@ChatGPT ${suffix}`);
    await composer.press("Enter");
    await expect(page.getByRole("button", { name: "Stop generation" })).toBeVisible();
    const partial = "Deterministic";
    await expect(page.getByText(partial, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Stop generation" }).click();
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText(partial, { exact: true })).toBeVisible();
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Retry / }).click();
    await expect(page.getByText(AI_TEXT, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(source, { exact: true })).toHaveCount(1);
    await page.reload();
    await expect(page.getByText(AI_TEXT, { exact: true })).toBeVisible();
    await expect(page.getByText(source, { exact: true })).toHaveCount(1);
    const publicId = page.url().split("/").pop()!;
    const db = new Database(getE2EDatabasePath(), { readonly: true });
    try {
      const counts = db.prepare(
        `SELECT COUNT(DISTINCT m.id) AS sourceCount,
                COUNT(a.id) AS attemptCount,
                SUM(CASE WHEN a.providerInvokedAt IS NOT NULL THEN 1 ELSE 0 END) AS invokedAttemptCount
         FROM Conversation c
         JOIN Message m ON m.conversationId = c.id AND m.content = ?
         JOIN AiGeneration g ON g.sourceMessageId = m.id
         JOIN AiGenerationAttempt a ON a.generationId = g.id
         WHERE c.publicId = ?`
      ).get(source, publicId) as { sourceCount: number; attemptCount: number; invokedAttemptCount: number };
      expect(counts).toEqual({ sourceCount: 1, attemptCount: 2, invokedAttemptCount: 2 });
    } finally {
      db.close();
    }
    await page.getByRole("button", { name: /Estimated|Cost unavailable|Calculating cost/ }).click();
    await expect(page.getByRole("heading", { name: "Usage & estimated cost" })).toBeVisible();
  } finally {
    await deleteE2EUser(user.id);
  }
});

test("authenticated member can join but cannot access owner Settings or Usage & Cost", async ({ browser }) => {
  const owner = await createE2EUser();
  const member = await createE2EUser();
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const db = new Database(getE2EDatabasePath());
  try {
    await login(ownerPage, owner);
    await createChat(ownerPage);
    const publicId = ownerPage.url().split("/").pop()!;
    const conversation = db.prepare(
      "SELECT id FROM Conversation WHERE publicId = ?"
    ).get(publicId) as { id: number };
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare(
      `INSERT INTO ConversationInvite
       (conversationId, token, createdById, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      conversation.id,
      token,
      owner.id,
      new Date().toISOString(),
      new Date(Date.now() + 3_600_000).toISOString()
    );

    await login(memberPage, member);
    await memberPage.goto(`/invite/${token}`);
    await memberPage.getByRole("button", { name: "Join conversation" }).click();
    await expect(memberPage).toHaveURL(new RegExp(`/chat/${publicId}$`), {
      timeout: 10_000,
    });
    await expect(memberPage.getByPlaceholder("Ask for another perspective...")).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(memberPage.getByRole("button", { name: /Estimated|Cost unavailable|Calculating cost/ })).toHaveCount(0);
    await memberPage.goto("/settings");
    await expect(memberPage).toHaveURL(new RegExp(`/chat/${publicId}$`));
  } finally {
    db.close();
    await ownerContext.close();
    await memberContext.close();
    await deleteE2EUser(member.id);
    await deleteE2EUser(owner.id);
  }
});
