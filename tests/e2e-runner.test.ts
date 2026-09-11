// @vitest-environment node

import { EventEmitter } from "node:events";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runE2E, spawnPlaywright } from "@/e2e/run.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

function createChild() {
  const child = new EventEmitter() as EventEmitter & {
    kill: (signal: string) => boolean;
  };
  child.kill = vi.fn((signal: string) => Boolean(signal));
  return child;
}

function dependencies(playwrightCode: number | null, cleanupError?: Error) {
  const events: string[] = [];
  const signalSource = new EventEmitter();
  const setup = vi.fn(async () => {
    events.push("setup");
  });
  const cleanup = vi.fn(async () => {
    events.push("cleanup");
    if (cleanupError) throw cleanupError;
  });
  const child = createChild();
  const spawnChild = vi.fn((workspace: string, args: string[]) => {
    void workspace;
    void args;
    events.push("spawn");
    queueMicrotask(() => {
      events.push("playwright-exit");
      child.emit(
        "exit",
        playwrightCode,
        playwrightCode === null ? "SIGINT" : null
      );
    });
    return child;
  });

  return { events, signalSource, setup, cleanup, child, spawnChild };
}

describe("E2E runner orchestration", () => {
  it("orders setup, Playwright completion, and final cleanup", async () => {
    const deps = dependencies(0);
    const code = await runE2E(deps);

    expect(deps.events).toEqual([
      "setup",
      "spawn",
      "playwright-exit",
      "cleanup",
    ]);
    expect(code).toBe(0);
  });

  it.each([0, 7])("cleans up after Playwright exit %s", async (exitCode) => {
    const deps = dependencies(exitCode);
    expect(await runE2E(deps)).toBe(exitCode);
    expect(deps.cleanup).toHaveBeenCalledOnce();
  });

  it("turns cleanup failure into failure after successful tests", async () => {
    const deps = dependencies(0, new Error("busy"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runE2E(deps)).toBe(1);
  });

  it("does not mask an existing Playwright failure", async () => {
    const deps = dependencies(7, new Error("busy"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runE2E(deps)).toBe(7);
  });

  it.each(["EBUSY", "EPERM"])(
    "does not spawn when strict setup fails with %s",
    async (errorCode) => {
      const deps = dependencies(0);
      const error = Object.assign(new Error("locked"), { code: errorCode });
      deps.setup.mockRejectedValue(error);

      await expect(runE2E(deps)).rejects.toMatchObject({ code: errorCode });
      expect(deps.spawnChild).not.toHaveBeenCalled();
      expect(deps.cleanup).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("forwards %s and removes signal handlers", async (signal, expectedCode) => {
    const events: string[] = [];
    const signalSource = new EventEmitter();
    const child = new EventEmitter() as EventEmitter & {
      kill: (signal: string) => boolean;
    };
    child.kill = vi.fn((receivedSignal: string) => Boolean(receivedSignal));
    const run = runE2E({
      setup: async () => undefined,
      cleanup: async () => undefined,
      spawnChild: () => child,
      signalSource,
    });

    await Promise.resolve();
    signalSource.emit(signal);
    expect(child.kill).toHaveBeenCalledWith(signal);
    child.emit("exit", null, signal);
    expect(await run).toBe(expectedCode);
    expect(signalSource.listenerCount("SIGINT")).toBe(0);
    expect(signalSource.listenerCount("SIGTERM")).toBe(0);
    expect(events).toEqual([]);
  });

  it("spawns the local CLI without a shell string", () => {
    const child = createChild();
    const spawnProcess = vi.fn((...spawnArguments: unknown[]) => {
      void spawnArguments;
      return child;
    });
    const consoleError = vi.spyOn(console, "error");
    const consoleLog = vi.spyOn(console, "log");
    const workspace = path.resolve("safe-test-workspace");

    spawnPlaywright(workspace, ["--list"], spawnProcess);

    const [command, args, options] = spawnProcess.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
      path.resolve(workspace, "node_modules/@playwright/test/cli.js"),
      "test",
      "--list",
    ]);
    expect(options).toMatchObject({ shell: false, stdio: "inherit" });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });
});
