import { readJsonFile, writeJsonAtomic } from "./storage.js";

export type ExecutionPhase = "received" | "accepted" | "submitted";
type JournalData = { version: 1; entries: Record<string, ExecutionPhase> };

export class ExecutionJournal {
  private entries = new Map<string, ExecutionPhase>();
  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    const data = await readJsonFile<JournalData>(this.path);
    if (!data) return;
    if (data.version !== 1 || typeof data.entries !== "object" || data.entries === null) throw new Error("invalid_execution_journal");
    for (const [id, phase] of Object.entries(data.entries)) {
      if (id && (phase === "received" || phase === "accepted" || phase === "submitted")) this.entries.set(id, phase);
    }
  }

  get(requestId: string) { return this.entries.get(requestId); }
  all() { return [...this.entries.entries()]; }
  async set(requestId: string, phase: ExecutionPhase) { this.entries.set(requestId, phase); await this.save(); }
  async delete(requestId: string) { this.entries.delete(requestId); await this.save(); }
  private save() { return writeJsonAtomic(this.path, { version: 1, entries: Object.fromEntries(this.entries) }); }
}
