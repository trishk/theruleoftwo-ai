// @vitest-environment node

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("SQLite migration chain", () => {
  it("applies every tracked migration to an empty temporary database", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "rule-of-two-migrations-")
    );
    const database = new Database(
      path.join(directory, "migration.db")
    );

    try {
      const migrationsRoot = path.resolve("prisma", "migrations");
      const migrationDirectories = (await readdir(migrationsRoot, {
        withFileTypes: true,
      }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

      for (const migrationDirectory of migrationDirectories) {
        const sql = await readFile(
          path.join(migrationsRoot, migrationDirectory, "migration.sql"),
          "utf8"
        );
        database.exec(sql);
      }

      const conversationColumns = database
        .prepare(`PRAGMA table_info("Conversation")`)
        .all() as Array<{ name: string; dflt_value: string | null }>;
      const inviteColumns = database
        .prepare(`PRAGMA table_info("ConversationInvite")`)
        .all() as Array<{ name: string; dflt_value: string | null }>;

      expect(conversationColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "allowMemberAiUsage",
            dflt_value: "false",
          }),
        ])
      );
      expect(inviteColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "usageCount",
            dflt_value: "0",
          }),
        ])
      );
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
