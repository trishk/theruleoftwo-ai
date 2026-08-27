import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

let db: Database.Database;
let conversationId: number;
let conversationPublicId: string;
let secondConversationId: number;
let secondConversationPublicId: string;
let inviteToken: string;
let ownerId: string;

test.beforeAll(() => {
  db = new Database(
    path.resolve(process.cwd(), "dev.db")
  );

  ownerId = `scroll-owner-${Date.now()}`;
  inviteToken = crypto.randomBytes(32).toString("hex");
  conversationPublicId = crypto.randomUUID().replaceAll("-", "");
  secondConversationPublicId = crypto.randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO User (id, name, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
  `).run(ownerId, "Scroll Test Owner", now, now);

  conversationId = Number(
    db.prepare(`
      INSERT INTO Conversation (
        publicId, title, ownerId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      conversationPublicId,
      "E2E Auto-scroll Test",
      ownerId,
      now,
      now
    ).lastInsertRowid
  );

  secondConversationId = Number(
    db.prepare(`
      INSERT INTO Conversation (
        publicId, title, ownerId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      secondConversationPublicId,
      "E2E Auto-scroll Conversation B",
      ownerId,
      now,
      now
    ).lastInsertRowid
  );

  db.prepare(`
    INSERT INTO ConversationInvite (
      conversationId, token, createdById, createdAt, expiresAt
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    conversationId,
    inviteToken,
    ownerId,
    now,
    new Date(Date.now() + 60 * 60 * 1000).toISOString()
  );

  const insertMessage = db.prepare(`
    INSERT INTO Message (
      conversationId, authorType, authorId, content, createdAt
    ) VALUES (?, 'human', ?, ?, ?)
  `);

  for (let index = 0; index < 40; index += 1) {
    insertMessage.run(
      conversationId,
      ownerId,
      `Historic message ${index + 1}: ${"content ".repeat(8)}`,
      new Date(Date.now() - (40 - index) * 1000).toISOString()
    );

    insertMessage.run(
      secondConversationId,
      ownerId,
      `Conversation B message ${index + 1}: ${"content ".repeat(8)}`,
      new Date(Date.now() - (40 - index) * 1000).toISOString()
    );
  }
});

test.afterAll(() => {
  if (!db) {
    return;
  }

  db.prepare("DELETE FROM Message WHERE conversationId = ?").run(
    conversationId
  );
  db.prepare("DELETE FROM Message WHERE conversationId = ?").run(
    secondConversationId
  );
  db.prepare(
    "DELETE FROM ConversationReadState WHERE conversationId = ?"
  ).run(conversationId);
  db.prepare(
    "DELETE FROM ConversationMember WHERE conversationId = ?"
  ).run(conversationId);
  db.prepare(
    "DELETE FROM ConversationMember WHERE conversationId = ?"
  ).run(secondConversationId);
  db.prepare(
    "DELETE FROM ConversationInvite WHERE conversationId = ?"
  ).run(conversationId);
  db.prepare("DELETE FROM Conversation WHERE id = ?").run(
    conversationId
  );
  db.prepare("DELETE FROM Conversation WHERE id = ?").run(
    secondConversationId
  );
  db.prepare("DELETE FROM User WHERE id = ?").run(ownerId);
  db.close();
});

async function joinConversation(
  page: import("@playwright/test").Page,
  name: string
) {
  await page.goto(`/invite/${inviteToken}`);
  await page.getByLabel("Your name").fill(name);
  await page
    .getByRole("button", { name: "Join conversation" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/chat/${conversationPublicId}$`)
  );
}

test("shows a sent message and preserves deliberate history reading", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await joinConversation(pageA, "Scroll Guest A");
    await joinConversation(pageB, "Scroll Guest B");

    const messageList = pageA
      .locator("div.overflow-y-auto")
      .filter({ hasText: "Historic message 40" });

    await messageList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(() =>
        messageList.evaluate(
          (element) =>
            element.scrollHeight -
            element.scrollTop -
            element.clientHeight
        )
      )
      .toBeLessThan(2);

    const ownMessage = `own-scroll-${Date.now()}`;
    await messageList.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    await pageA
      .getByPlaceholder("Ask for another perspective...")
      .fill(ownMessage);
    await pageA
      .getByRole("button", { name: "Send message" })
      .click();

    await expect(pageA.getByText(ownMessage, { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        messageList.evaluate(
          (element) =>
            element.scrollHeight -
            element.scrollTop -
            element.clientHeight
        )
      )
      .toBeLessThan(2);

    await messageList.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    const scrollTopWhileReading = await messageList.evaluate(
      (element) => element.scrollTop
    );

    const remoteWhileReading = `remote-reading-${Date.now()}`;
    await pageB
      .getByPlaceholder("Ask for another perspective...")
      .fill(remoteWhileReading);
    await pageB
      .getByRole("button", { name: "Send message" })
      .click();
    await expect(
      pageA.getByText(remoteWhileReading, { exact: true })
    ).toBeAttached();
    await expect
      .poll(() =>
        messageList.evaluate((element) => element.scrollTop)
      )
      .toBe(scrollTopWhileReading);

  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("opens a client-switched conversation at its latest message", async ({
  page,
}) => {
  await joinConversation(page, "Switch Guest");

  const guest = db
    .prepare(`
      SELECT userId
      FROM ConversationMember
      WHERE conversationId = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(conversationId) as { userId: string };

  db.prepare(`
    INSERT OR IGNORE INTO ConversationMember (
      conversationId, userId, role, createdAt
    ) VALUES (?, ?, 'member', ?)
  `).run(
    secondConversationId,
    guest.userId,
    new Date().toISOString()
  );

  await page.reload();
  const conversationAList = page
    .locator("div.overflow-y-auto")
    .filter({ hasText: "Historic message 40" });
  await conversationAList.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });

  await page
    .getByRole("link", {
      name: "E2E Auto-scroll Conversation B",
    })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/chat/${secondConversationPublicId}$`)
  );

  const conversationBList = page
    .locator("div.overflow-y-auto")
    .filter({ hasText: "Conversation B message 40" });
  await expect
    .poll(() =>
      conversationBList.evaluate(
        (element) =>
          element.scrollHeight -
          element.scrollTop -
          element.clientHeight
      )
    )
    .toBeLessThan(2);
});
