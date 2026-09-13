import type { AdapterCallbacks, AdapterStatus, GenerationJob, PersonalProviderAdapter } from "./types.js";

export class FakeGeminiAdapter implements PersonalProviderAdapter {
  readonly provider = "google" as const;
  constructor(private readonly failure: "none" | "before_submit" | "after_submit" = "none") {}
  async getStatus(): Promise<AdapterStatus> { return "ready"; }

  async execute(job: GenerationJob, callbacks: AdapterCallbacks) {
    if (this.failure === "before_submit") throw new Error("fake_before_submit");
    await callbacks.submitted();
    if (this.failure === "after_submit") throw new Error("fake_after_submit");
    return {
      remoteConversationId: job.remoteConversationId ?? `fake-${job.requestId}`,
      response: `Fake Gemini response for request ${job.requestId}`,
    };
  }
}
