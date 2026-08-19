import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

let db: Database.Database;

let conversationId: number;
let conversationPublicId: string;
let inviteToken: string;
let ownerId: string;

test.beforeAll(() => {
  db = new Database(
    path.resolve(process.cwd(), "dev.db")
  );

  ownerId = `e2e-owner-${Date.now()}`;
  inviteToken = crypto.randomBytes(32).toString("hex");

  conversationPublicId =
    crypto.randomUUID().replaceAll("-", "");

  const now = new Date().toISOString();

  const expiresAt = new Date(
    Date.now() + 60 * 60 * 1000
  ).toISOString();

  db.prepare(`
    INSERT INTO User (
      id,
      name,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, ?, ?)
  `).run(
    ownerId,
    "E2E Owner",
    now,
    now
  );

  const conversationResult = db.prepare(`
    INSERT INTO Conversation (
      publicId,
      title,
      ownerId,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    conversationPublicId,
    "E2E Realtime Test",
    ownerId,
    now,
    now
  );

  conversationId = Number(
    conversationResult.lastInsertRowid
  );

  db.prepare(`
    INSERT INTO ConversationInvite (
      conversationId,
      token,
      createdById,
      createdAt,
      expiresAt
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    conversationId,
    inviteToken,
    ownerId,
    now,
    expiresAt
  );
});

test.afterAll(() => {
  if (!db) {
    return;
  }

  if (conversationId) {
    db.prepare(`
      DELETE FROM Message
      WHERE conversationId = ?
    `).run(conversationId);

    db.prepare(`
      DELETE FROM ConversationReadState
      WHERE conversationId = ?
    `).run(conversationId);

    db.prepare(`
      DELETE FROM ConversationMember
      WHERE conversationId = ?
    `).run(conversationId);

    db.prepare(`
      DELETE FROM ConversationInvite
      WHERE conversationId = ?
    `).run(conversationId);

    db.prepare(`
      DELETE FROM Conversation
      WHERE id = ?
    `).run(conversationId);
  }

  if (ownerId) {
    db.prepare(`
      DELETE FROM User
      WHERE id = ?
    `).run(ownerId);
  }

  db.close();
});

test(
  "messages appear in another session without refresh",
  async ({ browser }) => {
    const contextA =
      await browser.newContext();

    const contextB =
      await browser.newContext();

    const pageA =
      await contextA.newPage();

    const pageB =
      await contextB.newPage();

    try {
      //
      // Guest A joins
      //
      await pageA.goto(
        `/invite/${inviteToken}`
      );

      await pageA
        .getByLabel("Your name")
        .fill("Realtime Guest A");

      await pageA
        .getByRole("button", {
          name: "Join conversation",
        })
        .click();

      await expect(
        pageA
      ).toHaveURL(
        new RegExp(
          `/chat/${conversationPublicId}$`
        )
      );

      //
      // Guest B joins independently
      //
      await pageB.goto(
        `/invite/${inviteToken}`
      );

      await pageB
        .getByLabel("Your name")
        .fill("Realtime Guest B");

      await pageB
        .getByRole("button", {
          name: "Join conversation",
        })
        .click();

      await expect(
        pageB
      ).toHaveURL(
        new RegExp(
          `/chat/${conversationPublicId}$`
        )
      );

      //
      // A -> B
      //
      const messageFromA =
        `realtime-A-${Date.now()}`;

      await pageA
        .getByPlaceholder(
          "Ask for another perspective..."
        )
        .fill(messageFromA);

      await pageA
        .getByRole("button", {
          name: "Send message",
        })
        .click();

      // Sender sees its own message.
      await expect(
        pageA.getByText(
          messageFromA,
          {
            exact: true,
          }
        )
      ).toBeVisible();

      // Critical realtime assertion:
      // B sees A's message WITHOUT reload.
      await expect(
        pageB.getByText(
          messageFromA,
          {
            exact: true,
          }
        )
      ).toBeVisible({
        timeout: 10_000,
      });

      //
      // B -> A
      //
      const messageFromB =
        `realtime-B-${Date.now()}`;

      await pageB
        .getByPlaceholder(
          "Ask for another perspective..."
        )
        .fill(messageFromB);

      await pageB
        .getByRole("button", {
          name: "Send message",
        })
        .click();

      // Sender B sees its own message.
      await expect(
        pageB.getByText(
          messageFromB,
          {
            exact: true,
          }
        )
      ).toBeVisible();

      // Critical realtime assertion:
      // A sees B's message WITHOUT reload.
      await expect(
        pageA.getByText(
          messageFromB,
          {
            exact: true,
          }
        )
      ).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  }
);