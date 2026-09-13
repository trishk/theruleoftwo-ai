# TheRuleOfTwo Windows Personal Agent

Foreground Windows runtime for the Personal Agent protocol. Increment 2A uses a deterministic fake Gemini adapter and makes outbound HTTPS requests only.

## Usage

Build from the repository root with `npm run personal-agent:build`, then set `TRULEOFTWO_BASE_URL` and run:

```text
npm run personal-agent -- pair
npm run personal-agent -- run
```

The `pair` command reads the one-time token from stdin after prompting; it must not be supplied as a command-line argument.

The bearer credential is DPAPI-encrypted for the current Windows user. Non-secret identity metadata and a minimal crash-recovery journal live under `%LOCALAPPDATA%\TheRuleOfTwo\PersonalAgent`.

On restart, a job known to be submitted is never submitted again; the runtime reports `generation.ambiguous`. A job recorded before submission is failed conservatively. There is a very small acknowledgement window between a successful server event response and local journal cleanup where the server may reject the replay as an already-applied transition. In that case the journal entry is retained, the job is suppressed, and the log reports `recovery needed`; operator/server reconciliation is required. The server remains the source of truth, and a richer reconciliation API is deferred.
