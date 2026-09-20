import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

export interface CredentialStore {
  get(): Promise<string | null>;
  set(credential: string): Promise<void>;
  delete(): Promise<void>;
}

export type Dpapi = { protect(value: string): Promise<string>; unprotect(value: string): Promise<string> };

const loadSecurityAssembly = "Add-Type -AssemblyName System.Security";
const protectScript = `${loadSecurityAssembly};$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($e))`;
const unprotectScript = `${loadSecurityAssembly};$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($d))`;

export function dpapiPowerShellInvocation(operation: "protect" | "unprotect") {
  return {
    executable: "powershell.exe",
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", operation === "protect" ? protectScript : unprotectScript],
  };
}

function runPowerShell(operation: "protect" | "unprotect", input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const invocation = dpapiPowerShellInvocation(operation);
    const child = spawn(invocation.executable, invocation.args, {
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
  protect: (value) => runPowerShell("protect", value),
  unprotect: (value) => runPowerShell("unprotect", value),
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

export class FileCredentialStore implements CredentialStore {
  constructor(private readonly path: string, private readonly readOnly = false) {}

  async get(): Promise<string | null> {
    try {
      return (await readFile(this.path, "utf8")).replace(/\r?\n$/, "");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !this.readOnly) return null;
      throw new Error("credential_store_unavailable");
    }
  }

  async set(credential: string): Promise<void> {
    if (this.readOnly) throw new Error("credential_store_read_only");
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, credential, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }

  async delete(): Promise<void> {
    if (!this.readOnly) await rm(this.path, { force: true });
  }
}

type CredentialStoreOptions = {
  platform: NodeJS.Platform;
  environment: NodeJS.ProcessEnv;
  mode: "pair" | "run";
  dataDir: string;
};

export function createCredentialStore(options: CredentialStoreOptions): CredentialStore {
  if (options.platform === "win32") return new DpapiCredentialStore(join(options.dataDir, "credential.dpapi"));
  const configuredPath = options.environment.TRULEOFTWO_AGENT_CREDENTIAL_FILE;
  if (configuredPath) {
    if (!posix.isAbsolute(configuredPath)) {
      throw new Error("invalid_credential_file");
    }
    return new FileCredentialStore(configuredPath, options.mode === "run");
  }
  throw new Error("credential_file_required");
}
