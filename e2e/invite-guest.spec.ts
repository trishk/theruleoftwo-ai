import {
  test,
  expect,
} from "@playwright/test";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

let db: Database.Database;

let conversationId: number;
let inviteToken: string;
let ownerId: string;

const guestUserIds =
  new Set<string>();

test.beforeAll(() => {
  db = new Database(
    path.resolve(
      process.cwd(),
      "dev.db"
    )
  );

  ownerId =
    `e2e-invite-owner-${Date.now()}`;

  inviteToken =
    crypto
      .randomBytes(32)
      .toString("hex");

  const now =
    new Date().toISOString();

  const expiresAt =
    new Date(
      Date.now() +
        60 * 60 * 1000
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
    "E2E Invite Owner",
    now,
    now
  );

  const conversationResult =
    db.prepare(`
      INSERT INTO Conversation (
        title,
        ownerId,
        createdAt,
        updatedAt
      )
      VALUES (?, ?, ?, ?)
    `).run(
      "E2E Guest Invite Test",
      ownerId,
      now,
      now
    );

  conversationId =
    Number(
      conversationResult
        .lastInsertRowid
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

test.afterEach(() => {
  if (
    !db ||
    !conversationId
  ) {
    return;
  }

  const memberships =
    db.prepare(`
      SELECT userId
      FROM ConversationMember
      WHERE conversationId = ?
        AND userId != ?
    `).all(
      conversationId,
      ownerId
    ) as Array<{
      userId: string;
    }>;

  for (
    const membership
    of memberships
  ) {
    guestUserIds.add(
      membership.userId
    );
  }
});

test.afterAll(() => {
  if (!db) {
    return;
  }

  if (conversationId) {
    db.prepare(`
      DELETE FROM Message
      WHERE conversationId = ?
    `).run(
      conversationId
    );

    db.prepare(`
      DELETE FROM ConversationReadState
      WHERE conversationId = ?
    `).run(
      conversationId
    );

    db.prepare(`
      DELETE FROM ConversationMember
      WHERE conversationId = ?
    `).run(
      conversationId
    );

    db.prepare(`
      DELETE FROM ConversationInvite
      WHERE conversationId = ?
    `).run(
      conversationId
    );

    db.prepare(`
      DELETE FROM Conversation
      WHERE id = ?
    `).run(
      conversationId
    );
  }

  for (
    const guestUserId
    of guestUserIds
  ) {
    db.prepare(`
      DELETE FROM User
      WHERE id = ?
    `).run(
      guestUserId
    );
  }

  if (ownerId) {
    db.prepare(`
      DELETE FROM User
      WHERE id = ?
    `).run(
      ownerId
    );
  }

  db.close();
});

test(
  "invalid invite shows an error page",
  async ({
    page,
  }) => {
    await page.goto(
      "/invite/this-token-does-not-exist"
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Invalid invite",
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "This invitation is invalid, expired, or has been revoked."
      )
    ).toBeVisible();
  }
);

test(
  "guest can join a conversation through a valid invite",
  async ({
    page,
  }) => {
    await page.goto(
      `/invite/${inviteToken}`
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Join conversation",
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "E2E Guest Invite Test",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    const joinButton =
      page.getByRole(
        "button",
        {
          name:
            "Join conversation",
        }
      );

    await expect(
      joinButton
    ).toBeDisabled();

    await page
      .getByLabel(
        "Your name"
      )
      .fill(
        "Invite Guest"
      );

    await expect(
      joinButton
    ).toBeEnabled();

    await joinButton.click();

    await expect(
      page
    ).toHaveURL(
      new RegExp(
        `/chat/${conversationId}$`
      ),
      {
        timeout: 10_000,
      }
    );

    await expect(
      page.getByPlaceholder(
        "Ask for another perspective..."
      )
    ).toBeVisible();
  }
);

test(
  "guest cannot access settings",
  async ({
    page,
  }) => {
    await page.goto(
      `/invite/${inviteToken}`
    );

    await page
      .getByLabel(
        "Your name"
      )
      .fill(
        "Restricted Guest"
      );

    await page
      .getByRole(
        "button",
        {
          name:
            "Join conversation",
        }
      )
      .click();

    await expect(
      page
    ).toHaveURL(
      new RegExp(
        `/chat/${conversationId}$`
      ),
      {
        timeout: 10_000,
      }
    );

    await expect(
      page.getByRole(
        "link",
        {
          name: "Settings",
        }
      )
    ).toHaveCount(0);

    await page.goto(
      "/settings"
    );

    await expect(
      page
    ).toHaveURL(
      new RegExp(
        `/chat/${conversationId}$`
      ),
      {
        timeout: 10_000,
      }
    );

    await expect(
      page.getByRole(
        "heading",
        {
          name: "Settings",
        }
      )
    ).toHaveCount(0);
  }
);