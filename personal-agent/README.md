# TheRuleOfTwo Windows Personal Agent

Foreground Windows runtime for the Personal Agent protocol. The production runtime attaches to the user's already-running Chrome through Playwright CDP and operates only Gemini Web. Chrome continues to own the Google login and Gemini's native Personal Account memory/personalization.

## Chrome setup

Close Chrome, then start the user-owned Chrome instance with a loopback debugging endpoint:

```text
chrome.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

Open `https://gemini.google.com/app`, sign in normally, and leave Chrome running. Keep exactly one Gemini tab open; unrelated tabs are ignored, while multiple Gemini tabs are refused as ambiguous. Recent Chrome versions may require a non-default `--user-data-dir` for remote debugging; if so, that Chrome profile remains user-managed and must be signed into Gemini by the user. The Agent never receives Google credentials and does not read cookies, browser storage, authorization headers, or profile files.

## Usage

Build from the repository root with `npm run personal-agent:build`, then set `TRULEOFTWO_BASE_URL` and run:

```text
npm run personal-agent -- pair
npm run personal-agent -- run
```

The `pair` command reads the one-time token from stdin after prompting; it must not be supplied as a command-line argument.

The bearer credential is DPAPI-encrypted for the current Windows user. Non-secret identity metadata and a minimal crash-recovery journal live under `%LOCALAPPDATA%\TheRuleOfTwo\PersonalAgent`.

The CDP endpoint defaults to `http://127.0.0.1:9222`. `TRULEOFTWO_GEMINI_CDP_ENDPOINT` may select another HTTP endpoint only on `127.0.0.1`, `localhost`, or `[::1]`; remote hosts, paths, credentials, HTTPS, query strings, and fragments are rejected. Optional bounded timeouts are `TRULEOFTWO_GEMINI_HYDRATION_TIMEOUT_MS` (default 15000, maximum 60000) and `TRULEOFTWO_GEMINI_RESPONSE_TIMEOUT_MS` (default 120000, maximum 600000).

### Manual smoke test

After the automated suite passes and Chrome is prepared, run the Agent and send one fresh Gemini Personal message through TheRuleOfTwo. Confirm one prompt appears in Gemini, its response returns to TheRuleOfTwo, and the resulting `/app/<conversation-id>` is persisted. Send a follow-up in the same TheRuleOfTwo conversation and confirm the same Gemini URL is reopened and context continues. Finally inspect Agent logs: they should contain request IDs and lifecycle/error codes, but no prompt or response text. The adapter does not call cookie, storage, header, screenshot, or raw-network APIs.

On restart, a job known to be submitted is never submitted again; the runtime reports `generation.ambiguous`. A job recorded before submission is failed conservatively. There is a very small acknowledgement window between a successful server event response and local journal cleanup where the server may reject the replay as an already-applied transition. In that case the journal entry is retained, the job is suppressed, and the log reports `recovery needed`; operator/server reconciliation is required. The server remains the source of truth, and a richer reconciliation API is deferred.
