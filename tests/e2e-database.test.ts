// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertE2EDatabasePath,
  cleanupE2EDatabase,
  getE2EDatabaseArtifacts,
  getE2EDatabasePath,
  setupE2EDatabase,
} from "@/e2e/database.mjs";

const workspaces: string[] = [];

async function createWorkspace() {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "rule-of-two-e2e-db-")
  );
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await cleanupE2EDatabase(workspace);
    await rm(workspace, { recursive: true });
  }
});

describe("dedicated E2E database", () => {
  it("accepts only the dedicated file and rejects unsafe paths", async () => {
    const workspace = await createWorkspace();
    const expected = getE2EDatabasePath(workspace);

    expect(assertE2EDatabasePath(expected, workspace)).toBe(expected);
    for (const unsafe of [
      "",
      workspace,
      path.parse(workspace).root,
      path.join(workspace, "dev.db"),
      path.join(workspace, "other.db"),
    ]) {
      expect(() =>
        assertE2EDatabasePath(unsafe, workspace)
      ).toThrow("Refusing unsafe E2E database path.");
    }

    await mkdir(expected);
    await expect(cleanupE2EDatabase(workspace)).rejects.toBeDefined();
    await rmdir(expected);
  });

  it("limits idempotent cleanup to the database and sidecars", async () => {
    const workspace = await createWorkspace();
    const artifacts = getE2EDatabaseArtifacts(workspace);
    const unrelated = path.join(workspace, "keep.txt");

    await Promise.all([
      ...artifacts.map((file) => writeFile(file, "test")),
      writeFile(unrelated, "keep"),
    ]);
    await cleanupE2EDatabase(workspace);
    await cleanupE2EDatabase(workspace);

    await expect(readFile(unrelated, "utf8")).resolves.toBe("keep");
  });

  it("stops setup when migration fails", async () => {
    const workspace = await createWorkspace();
    const databasePath = getE2EDatabasePath(workspace);
    const migrate = vi.fn(async () => {
      await writeFile(databasePath, "partial");
      throw new Error("controlled failure");
    });

    await expect(
      setupE2EDatabase(workspace, migrate)
    ).rejects.toThrow("controlled failure");
    expect(migrate).toHaveBeenCalledOnce();
    await expect(readFile(databasePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["EBUSY", "EPERM"])(
    "stops before migration when strict pre-cleanup fails with %s",
    async (errorCode) => {
      const workspace = await createWorkspace();
      const migrate = vi.fn();
      const cleanup = vi.fn().mockRejectedValue(
        Object.assign(new Error("locked"), { code: errorCode })
      );

      await expect(
        setupE2EDatabase(workspace, migrate, cleanup)
      ).rejects.toMatchObject({ code: errorCode });
      expect(migrate).not.toHaveBeenCalled();
    }
  );

  it("can be set up repeatedly with an injected migration runner", async () => {
    const workspace = await createWorkspace();
    const migrate = vi.fn(async (databaseUrl: string) => {
      const databasePath = databaseUrl
        .slice("file:".length)
        .replaceAll("/", path.sep);
      await writeFile(databasePath, "test");
    });

    await setupE2EDatabase(workspace, migrate);
    await setupE2EDatabase(workspace, migrate);

    expect(migrate).toHaveBeenCalledTimes(2);
  });

  it.each(["EBUSY", "EPERM"])(
    "retries final cleanup a bounded number of times for %s",
    async (errorCode) => {
      const workspace = await createWorkspace();
      let calls = 0;
      const remove = vi.fn(async () => {
        calls += 1;
        if (calls < 3) {
          throw Object.assign(new Error("locked"), { code: errorCode });
        }
      });
      const waitForRetry = vi.fn(async () => undefined);

      await cleanupE2EDatabase(workspace, {
        retries: 2,
        retryDelayMs: 0,
        waitForRetry,
        remove,
      });

      expect(remove).toHaveBeenCalledTimes(6);
      expect(waitForRetry).toHaveBeenCalledTimes(2);
    }
  );

  it("does not retry forever when a cleanup artifact stays busy", async () => {
    const workspace = await createWorkspace();
    const remove = vi.fn(async () => {
      throw Object.assign(new Error("locked"), { code: "EBUSY" });
    });

    await expect(
      cleanupE2EDatabase(workspace, {
        retries: 2,
        retryDelayMs: 0,
        waitForRetry: async () => undefined,
        remove,
      })
    ).rejects.toMatchObject({ code: "EBUSY" });
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
