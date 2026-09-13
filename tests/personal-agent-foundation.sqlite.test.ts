// @vitest-environment node

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/lib/generated/prisma/client";

const database = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!database.client) throw new Error("Personal-agent test database is not initialized.");
    return database.client;
  },
}));

import { authenticatePersonalAgent, PersonalAgentAuthenticationError } from "@/lib/personal-agent/auth";
import { createPairingToken, redeemPairingToken, revokePersonalAgent } from "@/lib/personal-agent/pairing";
import { isPersonalAgentOnline, updatePersonalAgentStatus } from "@/lib/personal-agent/presence";
import { POST as poll } from "@/app/api/personal-agent/poll/route";
import { POST as events } from "@/app/api/personal-agent/events/route";

let directory: string;

async function bearerFor(userId: string, now = new Date()) {
  const pairing = await createPairingToken(userId, now);
  const redeemed = await redeemPairingToken(pairing.pairingToken, now);
  if (!redeemed) throw new Error("Expected pairing to redeem.");
  return redeemed;
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rule-of-two-personal-agent-"));
  const databasePath = path.join(directory, "agent.db");
  const sqlite = new Database(databasePath);
  const migrations = (await readdir(path.resolve("prisma", "migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const migration of migrations) {
    sqlite.exec(await readFile(path.join("prisma", "migrations", migration, "migration.sql"), "utf8"));
  }
  sqlite.close();
  database.client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }),
  });
  await database.client.user.createMany({ data: [
    { id: "owner-a" }, { id: "owner-b" }, { id: "owner-c" },
    { id: "owner-d" }, { id: "owner-e" }, { id: "owner-f" },
  ] });
});

afterAll(async () => {
  await database.client?.$disconnect();
  await rm(directory, { recursive: true, force: true });
});

describe("personal-agent foundation", () => {
  it("creates a hashed, expiring, owner-scoped, single-use pairing token", async () => {
    const now = new Date("2026-09-13T10:00:00.000Z");
    const created = await createPairingToken("owner-a", now);
    expect(created.expiresAt).toEqual(new Date("2026-09-13T10:10:00.000Z"));
    const stored = await database.client!.personalAgentPairingToken.findUniqueOrThrow({ where: { userId: "owner-a" } });
    expect(stored.tokenHash).not.toContain(created.pairingToken);
    expect(stored.redeemedAt).toBeNull();

    const redeemed = await redeemPairingToken(created.pairingToken, now);
    expect(redeemed?.agentCredential).toMatch(/^pa1\./);
    await expect(redeemPairingToken(created.pairingToken, now)).resolves.toBeNull();
    const agent = await database.client!.personalAgent.findUniqueOrThrow({ where: { userId: "owner-a" } });
    expect(agent.credentialHash).not.toContain(redeemed!.agentCredential);
    expect(agent.userId).toBe("owner-a");
  });

  it("rejects an expired pairing token", async () => {
    const createdAt = new Date("2026-09-13T10:00:00.000Z");
    const created = await createPairingToken("owner-b", createdAt);
    await expect(redeemPairingToken(created.pairingToken, new Date("2026-09-13T10:10:00.001Z"))).resolves.toBeNull();
    expect(await database.client!.personalAgent.findUnique({ where: { userId: "owner-b" } })).toBeNull();
  });

  it("issues exactly one credential when the same pairing token is redeemed concurrently", async () => {
    const now = new Date("2026-09-13T11:00:00.000Z");
    const created = await createPairingToken("owner-f", now);

    // The better-sqlite3 adapter serializes writes on its connection, but these
    // invocations overlap through the real Prisma client and exercise the CAS.
    const results = await Promise.allSettled([
      redeemPairingToken(created.pairingToken, now),
      redeemPairingToken(created.pairingToken, now),
    ]);
    const issued = results.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : []
    );
    const failed = results.filter((result) =>
      result.status === "rejected" || result.value === null
    );

    expect(issued).toHaveLength(1);
    expect(issued[0]!.agentCredential).toMatch(/^pa1\./);
    expect(failed).toHaveLength(1);
    expect(await database.client!.personalAgent.count({ where: { userId: "owner-f" } })).toBe(1);
    const token = await database.client!.personalAgentPairingToken.findUniqueOrThrow({ where: { userId: "owner-f" } });
    expect(token.redeemedAt).toEqual(now);
  });

  it("authenticates the persistent credential and rejects invalid or revoked credentials", async () => {
    const paired = await bearerFor("owner-c");
    const request = new Request("http://localhost/api/personal-agent/poll", {
      method: "POST",
      headers: { authorization: `Bearer ${paired.agentCredential}` },
      body: JSON.stringify({ protocolVersion: 1, waitMs: 0 }),
    });
    await expect(authenticatePersonalAgent(request)).resolves.toMatchObject({ id: paired.agentId, userId: "owner-c" });
    await expect(authenticatePersonalAgent(new Request(request.url, {
      headers: { authorization: `Bearer pa1.${paired.agentId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` },
    }))).rejects.toBeInstanceOf(PersonalAgentAuthenticationError);
    await revokePersonalAgent("owner-c");
    await expect(authenticatePersonalAgent(request)).rejects.toBeInstanceOf(PersonalAgentAuthenticationError);
  });

  it("re-pairing replaces the old credential and preserves agent ownership", async () => {
    const first = await bearerFor("owner-d");
    const second = await bearerFor("owner-d");
    expect(second.agentCredential).not.toBe(first.agentCredential);
    await expect(authenticatePersonalAgent(new Request("http://localhost", {
      headers: { authorization: `Bearer ${first.agentCredential}` },
    }))).rejects.toBeInstanceOf(PersonalAgentAuthenticationError);
    await expect(authenticatePersonalAgent(new Request("http://localhost", {
      headers: { authorization: `Bearer ${second.agentCredential}` },
    }))).resolves.toMatchObject({ userId: "owner-d" });
    expect(await database.client!.personalAgent.count({ where: { userId: "owner-d" } })).toBe(1);
  });

  it("accepts fake-agent polling and status events while updating presence", async () => {
    const paired = await bearerFor("owner-e");
    const headers = {
      authorization: `Bearer ${paired.agentCredential}`,
      "content-type": "application/json",
    };
    const pollResponse = await poll(new Request("http://localhost/api/personal-agent/poll", {
      method: "POST", headers, body: JSON.stringify({ protocolVersion: 1, waitMs: 0 }),
    }));
    expect(pollResponse.status).toBe(200);
    expect(await pollResponse.json()).toEqual({ protocolVersion: 1, job: null });

    const eventResponse = await events(new Request("http://localhost/api/personal-agent/events", {
      method: "POST", headers, body: JSON.stringify({
        type: "hello",
        protocolVersion: 1,
        adapter: { provider: "google", kind: "gemini_personal", status: "ready" },
      }),
    }));
    expect(eventResponse.status).toBe(200);
    const agent = await database.client!.personalAgent.findUniqueOrThrow({ where: { id: paired.agentId } });
    expect(agent.adapterStatus).toBe("ready");
    expect(agent.lastSeenAt).not.toBeNull();
    expect(isPersonalAgentOnline(agent.lastSeenAt, new Date(agent.lastSeenAt!.getTime() + 59_999))).toBe(true);
    expect(isPersonalAgentOnline(agent.lastSeenAt, new Date(agent.lastSeenAt!.getTime() + 60_001))).toBe(false);
  });

  it("rejects unauthenticated polls and cannot update a revoked agent status", async () => {
    const unauthorized = await poll(new Request("http://localhost/api/personal-agent/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: 1, waitMs: 0 }),
    }));
    expect(unauthorized.status).toBe(401);
    const revoked = await database.client!.personalAgent.findUniqueOrThrow({ where: { userId: "owner-c" } });
    await expect(updatePersonalAgentStatus(revoked.id, "ready")).resolves.toEqual({ count: 0 });
  });
});
