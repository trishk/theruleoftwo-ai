import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CredentialStore {
  get(): Promise<string | null>;
  set(credential: string): Promise<void>;
  delete(): Promise<void>;
}

export type Dpapi = { protect(value: string): Promise<string>; unprotect(value: string): Promise<string> };

const protectScript = "$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($e))";
const unprotectScript = "$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($d))";

function runPowerShell(script: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    // Intentionally discard stderr: PowerShell errors can echo input context.
    child.stderr.resume();
    child.on("error", () => reject(new Error("credential_store_unavailable")));
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(stdout).toString("utf8")) : reject(new Error("credential_store_failed")));
    child.stdin.end(input);
  });
}

export const windowsDpapi: Dpapi = {
  protect: (value) => runPowerShell(protectScript, value),
  unprotect: (value) => runPowerShell(unprotectScript, value),
};

export class DpapiCredentialStore implements CredentialStore {
  constructor(private readonly path: string, private readonly dpapi: Dpapi = windowsDpapi) {}

  async get(): Promise<string | null> {
    try {
      const encrypted = await readFile(this.path, "utf8");
      return await this.dpapi.unprotect(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async set(credential: string): Promise<void> {
    const encrypted = await this.dpapi.protect(credential);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, encrypted, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }

  async delete(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
