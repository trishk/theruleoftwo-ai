import type { Readable } from "node:stream";

const MAX_PAIRING_TOKEN_BYTES = 512;

export function validatePairArguments(argv: string[]): void {
  if (argv[2] === "pair" && argv.length > 3) throw new Error("pairing_token_must_use_stdin");
}

export async function readPairingToken(input: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const cleanup = () => {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      chunks.forEach((chunk) => chunk.fill(0));
    };
    const finish = () => {
      const token = Buffer.concat(chunks, total).toString("utf8").split(/\r?\n/, 1)[0].trim();
      cleanup();
      if (!token) reject(new Error("pairing_token_required"));
      else resolve(token);
    };
    const onData = (value: Buffer | string) => {
      const incoming = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
      const newline = incoming.indexOf(0x0a);
      const chunk = newline >= 0 ? incoming.subarray(0, newline + 1) : incoming;
      total += chunk.byteLength;
      if (total > MAX_PAIRING_TOKEN_BYTES) { incoming.fill(0); cleanup(); reject(new Error("pairing_token_too_large")); return; }
      chunks.push(Buffer.from(chunk));
      incoming.fill(0);
      if (newline >= 0) { input.pause(); finish(); }
    };
    const onEnd = () => finish();
    const onError = () => { cleanup(); reject(new Error("pairing_token_read_failed")); };
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
  });
}
