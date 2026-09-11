export function spawnPlaywright(
  workspacePath: string,
  args: string[],
  spawnProcess?: (...args: unknown[]) => unknown
): unknown;

export function runE2E(options?: {
  workspacePath?: string;
  args?: string[];
  setup?: (workspacePath: string) => Promise<void>;
  cleanup?: (
    workspacePath: string,
    options: { retries: number; retryDelayMs: number }
  ) => Promise<void>;
  spawnChild?: (workspacePath: string, args: string[]) => unknown;
  signalSource?: unknown;
}): Promise<number>;
