import { readJsonFile, writeJsonAtomic } from "./storage.js";

export type ExecutionPhase = "received" | "accepted" | "send_attempted" | "submitted";
type JournalData = { version: 1; entries: Record<string, ExecutionPhase> };

export class ExecutionJournal {
  private entries = new Map<string, ExecutionPhase>();
  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    const data = await readJsonFile<JournalData>(this.path);
    if (data === undefined) return;
    if (typeof data !== "object" || data === null || data.version !== 1 ||
        typeof data.entries !== "object" || data.entries === null || Array.isArray(data.entries)) {
      throw new Error("invalid_execution_journal");
    }
    const loaded = new Map<string, ExecutionPhase>();
    for (const [id, phase] of Object.entries(data.entries)) {
      if (!id || id.length > 100 || (phase !== "received" && phase !== "accepted" && phase !== "send_attempted" && phase !== "submitted")) {
        throw new Error("invalid_execution_journal");
      }
      loaded.set(id, phase);
    }
    this.entries = loaded;
  }

  get(requestId: string) { return this.entries.get(requestId); }
  all() { return [...this.entries.entries()]; }
  async set(requestId: string, phase: ExecutionPhase) { this.entries.set(requestId, phase); await this.save(); }
  async delete(requestId: string) { this.entries.delete(requestId); await this.save(); }
  private save() { return writeJsonAtomic(this.path, { version: 1, entries: Object.fromEntries(this.entries) }); }
}
