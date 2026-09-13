import { loadConfig, credentialPath, journalPath } from "./config.js";
import { DpapiCredentialStore } from "./credential-store.js";
import { FakeGeminiAdapter } from "./fake-gemini-adapter.js";
import { PersonalAgentHttpClient, AgentHttpError } from "./http-client.js";
import { ExecutionJournal } from "./journal.js";
import { consoleLogger } from "./logger.js";
import { pairAgent } from "./pairing.js";
import { PersonalAgentRuntime } from "./runtime.js";
import { readPairingToken, validatePairArguments } from "./input.js";

async function main() {
  if (process.platform !== "win32") throw new Error("windows_required");
  const command = process.argv[2];
  validatePairArguments(process.argv);
  const config = await loadConfig(process.env, command === "pair" ? "pair" : "run");
  const client = new PersonalAgentHttpClient(config.baseUrl, config.requestTimeoutMs);
  const store = new DpapiCredentialStore(credentialPath(config.dataDir));
  if (command === "pair") {
    consoleLogger.info("Enter pairing token, then press Enter:");
    await pairAgent(await readPairingToken(process.stdin), config, client, store, consoleLogger);
    return;
  }
  if (command !== "run") throw new Error("usage: personal-agent <pair|run>");
  const runtime = new PersonalAgentRuntime({ config, client, credentialStore: store, journal: new ExecutionJournal(journalPath(config.dataDir)), adapter: new FakeGeminiAdapter(), logger: consoleLogger });
  const shutdown = () => { consoleLogger.info("Stopping Personal Agent."); runtime.stop(); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await runtime.run();
}

main().catch((error: unknown) => {
  const code = error instanceof AgentHttpError ? error.code : error instanceof Error ? error.message : "startup_failed";
  const friendly = code === "unauthorized" ? "Pairing was rejected. Request a new pairing token."
    : code === "rate_limited" ? "Pairing is temporarily rate limited. Try again later."
    : code === "base_url_required" ? "TRULEOFTWO_BASE_URL is required for initial pairing."
    : code === "paired_origin_mismatch" ? "Configured server differs from the paired server; re-pair explicitly."
    : code === "paired_state_mismatch" || code === "pairing_metadata_required" ? "Paired state is inconsistent; re-pair explicitly."
    : code === "pairing_token_must_use_stdin" ? "Do not pass the pairing token as an argument; run pair and enter it on stdin."
    : code.startsWith("usage:") ? code : `Personal Agent could not start (${code}).`;
  consoleLogger.error(friendly);
  process.exitCode = 1;
});
