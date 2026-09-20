import { loadConfig } from "./config.js";
import { createCredentialStore } from "./credential-store.js";
import { GeminiBrowserAdapter } from "./gemini-browser-adapter.js";
import { PersonalAgentHttpClient, AgentHttpError } from "./http-client.js";
import { ExecutionJournal } from "./journal.js";
import { consoleLogger } from "./logger.js";
import { pairAgent } from "./pairing.js";
import { runPreflight } from "./preflight.js";
import { PersonalAgentRuntime } from "./runtime.js";
import { readPairingToken, validatePairArguments } from "./input.js";

async function main() {
  const command = process.argv[2];
  validatePairArguments(process.argv);
  const config = await loadConfig(process.env, command === "pair" ? "pair" : "run");
  const client = new PersonalAgentHttpClient(config.baseUrl, config.requestTimeoutMs);
  const store = createCredentialStore({ platform: process.platform, environment: process.env, mode: command === "pair" ? "pair" : "run", dataDir: config.dataDir });
  if (command === "pair") {
    consoleLogger.info("Enter pairing token, then press Enter:");
    await pairAgent(await readPairingToken(process.stdin), config, client, store, consoleLogger);
    return;
  }
  if (command === "preflight") {
    await runPreflight({
      config,
      client,
      credentialStore: store,
      journal: new ExecutionJournal(config.journalPath),
      adapter: new GeminiBrowserAdapter(config),
      logger: consoleLogger,
    });
    return;
  }
  if (command !== "run") throw new Error("usage: personal-agent <pair|preflight|run>");
  const runtime = new PersonalAgentRuntime({ config, client, credentialStore: store, journal: new ExecutionJournal(config.journalPath), adapter: new GeminiBrowserAdapter(config), logger: consoleLogger });
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
    : code === "data_dir_required" ? "TRULEOFTWO_AGENT_DATA_DIR is required on this platform."
    : code === "credential_file_required" ? "TRULEOFTWO_AGENT_CREDENTIAL_FILE is required on this platform."
    : code === "credential_store_unavailable" ? "The configured Personal Agent credential file is unavailable."
    : code === "paired_origin_mismatch" ? "Configured server differs from the paired server; re-pair explicitly."
    : code === "paired_state_mismatch" || code === "pairing_metadata_required" ? "Paired state is inconsistent; re-pair explicitly."
    : code === "agent_state_not_writable" ? "Persistent Personal Agent state is not writable."
    : code === "preflight_chrome_unavailable" ? "Preflight failed: Chromium CDP is unavailable."
    : code === "preflight_sign_in_required" ? "Preflight failed: manually sign in to Google/Gemini in the Chromium GUI."
    : code === "preflight_gemini_unavailable" ? "Preflight failed: Gemini is not ready in Chromium."
    : code === "pairing_token_must_use_stdin" ? "Do not pass the pairing token as an argument; run pair and enter it on stdin."
    : code.startsWith("usage:") ? code : `Personal Agent could not start (${code}).`;
  consoleLogger.error(friendly);
  process.exitCode = 1;
});
