export class ExponentialBackoff {
  private attempt = 0;
  constructor(private readonly initialMs = 500, private readonly maxMs = 30_000, private readonly random: () => number = Math.random) {}
  next(): number {
    const cap = Math.min(this.maxMs, this.initialMs * (2 ** this.attempt++));
    return Math.floor(cap * (0.5 + this.random() * 0.5));
  }
  reset() { this.attempt = 0; }
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
