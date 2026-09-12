import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import path from "node:path";

export const E2E_DATABASE_FILENAME = "e2e.db";
const RETRYABLE_CLEANUP_CODES = new Set(["EBUSY", "EPERM"]);

export function getE2EDatabasePath(workspacePath = process.cwd()) {
  const canonicalWorkspace = realpathSync.native(workspacePath);
  return path.resolve(canonicalWorkspace, E2E_DATABASE_FILENAME);
}

export function assertE2EDatabasePath(
  candidate,
  workspacePath = process.cwd()
) {
  const expected = getE2EDatabasePath(workspacePath);

  if (!candidate || path.resolve(candidate) !== expected) {
    throw new Error("Refusing unsafe E2E database path.");
  }

  return expected;
}

export function getE2EDatabaseArtifacts(workspacePath = process.cwd()) {
  const databasePath = assertE2EDatabasePath(
    getE2EDatabasePath(workspacePath),
    workspacePath
  );

  return [
    databasePath,
    `${databasePath}-journal`,
    `${databasePath}-shm`,
    `${databasePath}-wal`,
  ];
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function removeArtifact(artifact) {
  let stats;
  try {
    stats = await lstat(artifact);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("Refusing unsafe E2E database artifact.");
  }

  await unlink(artifact);
}

export async function cleanupE2EDatabase(
  workspacePath = process.cwd(),
  {
    retries = 0,
    retryDelayMs = 50,
    waitForRetry = wait,
    remove = removeArtifact,
  } = {}
) {
  const artifacts = getE2EDatabaseArtifacts(workspacePath);

  for (const artifact of artifacts) {
    let attempt = 0;
    while (true) {
      try {
        await remove(artifact);
        break;
      } catch (error) {
        if (
          !RETRYABLE_CLEANUP_CODES.has(error?.code) ||
          attempt >= retries
        ) {
          throw error;
        }
        attempt += 1;
        await waitForRetry(retryDelayMs);
      }
    }
  }
}

export const runE2EMigrations = (databaseUrl, workspacePath) =>
  new Promise((resolve, reject) => {
    const prismaCli = path.resolve(
      workspacePath,
      "node_modules/prisma/build/index.js"
    );
    const child = spawn(
      process.execPath,
      [prismaCli, "migrate", "deploy"],
      {
        cwd: workspacePath,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        shell: false,
        stdio: "inherit",
      }
    );

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("E2E database migration failed."));
      }
    });
  });

export async function setupE2EDatabase(
  workspacePath = process.cwd(),
  migrate = runE2EMigrations,
  cleanup = cleanupE2EDatabase
) {
  const databasePath = assertE2EDatabasePath(
    getE2EDatabasePath(workspacePath),
    workspacePath
  );

  await cleanup(workspacePath);
  try {
    const databaseFile = await open(
      databasePath,
      "wx"
    );
    await databaseFile.close();

    await migrate(
      `file:${databasePath.replaceAll("\\", "/")}`,
      workspacePath
    );
  } catch (error) {
    await cleanup(workspacePath);
    throw error;
  }
}
