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
      const integrationColumns = database
        .prepare(`PRAGMA table_info("UserIntegration")`)
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
      expect(integrationColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "connectionMode",
            dflt_value: "'api'",
          }),
        ])
      );

      database.exec(`
        INSERT INTO "User" ("id", "createdAt", "updatedAt") VALUES ('owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "Conversation" ("id", "publicId", "title", "ownerId", "createdAt", "updatedAt") VALUES (1, 'public-1', 'Test', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "Message" ("id", "conversationId", "authorType", "authorId", "content", "createdAt") VALUES (1, 1, 'human', 'owner', 'hello', CURRENT_TIMESTAMP);
        INSERT INTO "AiGeneration" ("id", "conversationId", "sourceMessageId", "provider", "initialRequesterId", "createdAt", "updatedAt") VALUES ('generation', 1, 1, 'openai', 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "AiGenerationAttempt" ("id", "generationId", "attemptNumber", "requesterId", "status", "progressAt") VALUES ('legacy', 'generation', 1, 'owner', 'completed', CURRENT_TIMESTAMP);
        INSERT INTO "UserIntegration" ("userId", "provider", "selectedModel", "createdAt", "updatedAt") VALUES ('owner', 'google', 'gemini-test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "ProviderConversation" ("conversationId", "provider", "remoteConversationId", "createdAt", "updatedAt") VALUES (1, 'google', 'remote-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `);

      expect(database.prepare(`SELECT "connectionMode" FROM "UserIntegration" WHERE "userId"='owner'`).get())
        .toEqual({ connectionMode: "api" });
      expect(() => database.prepare(`UPDATE "UserIntegration" SET "connectionMode"='invalid' WHERE "userId"='owner'`).run()).toThrow();
      expect(() => database.prepare(`INSERT INTO "ProviderConversation" ("conversationId", "provider", "remoteConversationId", "createdAt", "updatedAt") VALUES (1, 'google', 'remote-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run()).toThrow();

      expect(() => database.prepare(`UPDATE "AiGenerationAttempt" SET "estimatedCostNanoUsd" = 1 WHERE "id" = 'legacy'`).run()).toThrow();
      const insertAttempt = (id: string, number: number, usageState: string | null, costState: string | null, cost: number | null) => database.prepare(`INSERT INTO "AiGenerationAttempt" ("id", "generationId", "attemptNumber", "requesterId", "status", "progressAt", "usageState", "costState", "estimatedCostNanoUsd") VALUES (?, 'generation', ?, 'owner', 'completed', CURRENT_TIMESTAMP, ?, ?, ?)`).run(id, number, usageState, costState, cost);
      expect(() => insertAttempt("invalid-null", 2, null, null, 1)).toThrow();
      expect(() => insertAttempt("invalid-usage", 3, "pending", "estimated", 1)).toThrow();
      expect(() => insertAttempt("invalid-cost-state", 4, "captured", "unknown", 1)).toThrow();
      expect(() => insertAttempt("invalid-negative", 5, "captured", "estimated", -1)).toThrow();
      expect(() => insertAttempt("invalid-terminal", 6, null, null, null) && database.prepare(`UPDATE "AiGenerationAttempt" SET "completedAt"=CURRENT_TIMESTAMP, "failedAt"=CURRENT_TIMESTAMP WHERE "id"='invalid-terminal'`).run()).toThrow();
      expect(() => insertAttempt("valid", 7, "captured", "estimated", 0)).not.toThrow();
      expect(database.prepare(`SELECT "usageState", "costState", "estimatedCostNanoUsd" FROM "AiGenerationAttempt" WHERE "id"='legacy'`).get()).toEqual({ usageState: null, costState: null, estimatedCostNanoUsd: null });

      const indexes = database.prepare(`PRAGMA index_list("AiGenerationAttempt")`).all() as Array<{ name: string }>;
      expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
        "AiGenerationAttempt_retryOfId_key", "AiGenerationAttempt_outputMessageId_key",
        "AiGenerationAttempt_generationId_attemptNumber_key", "AiGenerationAttempt_status_progressAt_idx",
        "AiGenerationAttempt_personal_queue_idx", "AiGenerationAttempt_personalAgentId_personalState_idx",
        "AiGenerationAttempt_personal_agent_active_key",
      ]));
      expect(database.prepare(`PRAGMA foreign_key_list("AiGenerationAttempt")`).all()).toHaveLength(5);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves related attempts and telemetry across the corrective rebuild", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rule-of-two-usage-rebuild-"));
    const database = new Database(path.join(directory, "migration.db"));
    try {
      const migrationsRoot = path.resolve("prisma", "migrations");
      const migrationDirectories = (await readdir(migrationsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      for (const migrationDirectory of migrationDirectories) {
        if (migrationDirectory > "20260911120000_add_attempt_usage_cost_visibility") break;
        database.exec(await readFile(path.join(migrationsRoot, migrationDirectory, "migration.sql"), "utf8"));
      }
      database.pragma("foreign_keys = ON");
      database.exec(`
        INSERT INTO "User" ("id", "createdAt", "updatedAt") VALUES ('owner-related', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "Conversation" ("id", "publicId", "title", "ownerId", "createdAt", "updatedAt") VALUES (91, 'related-public', 'Related', 'owner-related', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "Message" ("id", "conversationId", "authorType", "authorId", "content", "createdAt") VALUES
          (91, 91, 'human', 'owner-related', 'source', CURRENT_TIMESTAMP),
          (92, 91, 'ai', 'openai', 'first output', CURRENT_TIMESTAMP),
          (93, 91, 'ai', 'openai', 'retry output', CURRENT_TIMESTAMP),
          (94, 91, 'ai', 'openai', 'legacy output', CURRENT_TIMESTAMP);
        INSERT INTO "AiGeneration" ("id", "conversationId", "sourceMessageId", "provider", "initialRequesterId", "createdAt", "updatedAt") VALUES ('related-generation', 91, 91, 'openai', 'owner-related', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO "AiGenerationAttempt" ("id", "generationId", "attemptNumber", "requesterId", "status", "outputMessageId", "progressAt", "completedAt", "providerInvokedAt", "usageState", "costState", "providerSnapshot", "requestedModel", "effectiveModel", "effectiveModelSource", "inputTokens", "inputTokensNoCache", "inputTokensCacheRead", "inputTokensCacheWrite", "outputTokens", "outputTextTokens", "outputReasoningTokens", "totalTokens", "usageCapturedAt", "pricingVersion", "pricingCurrency", "inputRateNanoUsdPerToken", "cacheReadRateNanoUsdPerToken", "cacheWriteRateNanoUsdPerToken", "outputRateNanoUsdPerToken", "estimatedCostNanoUsd") VALUES ('related-initial', 'related-generation', 1, 'owner-related', 'completed', 92, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'captured', 'estimated', 'openai', 'gpt-5', 'gpt-5', 'provider', 10, 8, 2, 0, 4, 3, 1, 14, CURRENT_TIMESTAMP, 'v1', 'USD', 1, 1, 1, 1, 14);
        INSERT INTO "AiGenerationAttempt" ("id", "generationId", "attemptNumber", "requesterId", "status", "outputMessageId", "progressAt", "providerInvokedAt", "usageState", "costState", "providerSnapshot", "requestedModel") VALUES ('related-retry', 'related-generation', 2, 'owner-related', 'failed', 93, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending', 'pending', 'openai', 'gpt-5');
        INSERT INTO "AiGenerationAttempt" ("id", "generationId", "attemptNumber", "requesterId", "status", "outputMessageId", "progressAt", "completedAt") VALUES ('related-legacy', 'related-generation', 3, 'owner-related', 'completed', 94, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        UPDATE "AiGenerationAttempt" SET "retryOfId"='related-initial' WHERE "id"='related-retry';
      `);
      const before = database.prepare(`SELECT * FROM "AiGenerationAttempt" ORDER BY "attemptNumber"`).all();
      database.exec(await readFile(path.join(migrationsRoot, "20260911130000_fix_attempt_usage_cost_constraint", "migration.sql"), "utf8"));
      const after = database.prepare(`SELECT * FROM "AiGenerationAttempt" ORDER BY "attemptNumber"`).all();
      expect(after).toEqual(before);
      expect(database.prepare(`SELECT "retryOfId", "outputMessageId" FROM "AiGenerationAttempt" WHERE "id"='related-retry'`).get()).toEqual({ retryOfId: "related-initial", outputMessageId: 93 });
      expect(database.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
      const foreignKeys = database.prepare(`PRAGMA foreign_key_list("AiGenerationAttempt")`).all() as Array<{ table: string }>;
      expect(foreignKeys).toHaveLength(4);
      expect(foreignKeys.map((key) => key.table)).toContain("AiGenerationAttempt");
      const indexes = database.prepare(`PRAGMA index_list("AiGenerationAttempt")`).all() as Array<{ name: string }>;
      expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["AiGenerationAttempt_retryOfId_key", "AiGenerationAttempt_outputMessageId_key", "AiGenerationAttempt_generationId_attemptNumber_key", "AiGenerationAttempt_status_progressAt_idx"]));
      const tableSql = (database.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='AiGenerationAttempt'`).get() as { sql: string }).sql;
      expect(tableSql).toContain("AiGenerationAttempt_terminal_timestamp_check");
      expect(() => database.prepare(`UPDATE "AiGenerationAttempt" SET "estimatedCostNanoUsd"=1 WHERE "id"='related-legacy'`).run()).toThrow();
      expect(database.prepare(`SELECT "usageState", "costState", "estimatedCostNanoUsd" FROM "AiGenerationAttempt" WHERE "id"='related-initial'`).get()).toEqual({ usageState: "captured", costState: "estimated", estimatedCostNanoUsd: 14 });
      expect(database.prepare(`SELECT "usageState", "costState" FROM "AiGenerationAttempt" WHERE "id"='related-legacy'`).get()).toEqual({ usageState: null, costState: null });
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
