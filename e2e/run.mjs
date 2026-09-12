import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  cleanupE2EDatabase,
  setupE2EDatabase,
} from "./database.mjs";
import e2eConfig from "./config.mjs";

const { E2E_ORIGIN } = e2eConfig;

export const spawnPlaywright = (
  workspacePath,
  args,
  spawnProcess = spawn
) => {
  const playwrightCli = path.resolve(
    workspacePath,
    "node_modules/@playwright/test/cli.js"
  );

  return spawnProcess(
    process.execPath,
    [playwrightCli, "test", ...args],
    {
      cwd: workspacePath,
      env: {
        ...process.env,
        NODE_ENV: "development",
        E2E_TESTING: "1",
        DATABASE_URL: "file:./e2e.db",
        APP_URL: E2E_ORIGIN,
      },
      shell: false,
      stdio: "inherit",
    }
  );
};

const waitForChild = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });

export async function runE2E({
  workspacePath = process.cwd(),
  args = [],
  setup = setupE2EDatabase,
  cleanup = cleanupE2EDatabase,
  spawnChild = spawnPlaywright,
  signalSource = process,
} = {}) {
  await setup(workspacePath);

  let child;
  let childExited = false;
  const forwardSignal = (signal) => {
    if (!childExited) {
      child.kill(signal);
    }
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  let playwrightCode = 1;
  try {
    child = spawnChild(workspacePath, args);
    signalSource.on("SIGINT", onSigint);
    signalSource.on("SIGTERM", onSigterm);
    const result = await waitForChild(child);
    childExited = true;
    playwrightCode =
      result.code ??
      (result.signal === "SIGINT"
        ? 130
        : result.signal === "SIGTERM"
          ? 143
          : 1);
  } finally {
    if (child) {
      signalSource.off("SIGINT", onSigint);
      signalSource.off("SIGTERM", onSigterm);
    }

    try {
      await cleanup(workspacePath, {
        retries: 3,
        retryDelayMs: 100,
      });
    } catch {
      console.error("E2E database artifacts could not be cleaned up.");
      if (playwrightCode === 0) {
        playwrightCode = 1;
      }
    }
  }

  return playwrightCode;
}

async function main() {
  try {
    process.exitCode = await runE2E({
      args: process.argv.slice(2),
    });
  } catch {
    console.error("E2E setup or runner failed.");
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
