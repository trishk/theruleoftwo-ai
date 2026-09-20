# TheRuleOfTwo Personal Agent

The same Personal Agent core supports Windows and Linux containers. It attaches through Playwright CDP to an externally owned browser and operates only Gemini Web. The browser owns Google authentication, its persistent profile, and Gemini Personal Account state. The Agent does not automate Google login or read cookies, browser storage, authorization headers, or profile files.

## Windows mode

Close Chrome and start the user-owned browser with loopback CDP. Recent Chrome versions may require a non-default user-data directory; that profile remains user-managed.

```text
chrome.exe --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

Open `https://gemini.google.com/app`, authenticate manually, and leave exactly one Gemini tab open. Build from the repository root, set `TRULEOFTWO_BASE_URL`, then pair and run:

```text
npm run personal-agent:build
npm run personal-agent -- pair
npm run personal-agent -- run
```

The pairing token is read from stdin and must not be supplied as a command-line argument. On Windows, the Personal Agent credential is always DPAPI-encrypted for the current user. Metadata and the recovery journal remain under `%LOCALAPPDATA%\TheRuleOfTwo\PersonalAgent`.

Windows CDP defaults to `http://127.0.0.1:9222` and accepts only HTTP loopback endpoints with an explicit port and no credentials, path, query, or fragment.

## Docker/Linux mode

`docker-compose.yml` runs two services on one Compose bridge network:

```text
Personal Agent container -> http://chromium:9222 -> Chromium container -> Gemini
```

CDP port `9222` is not published to the host. Only the Chromium HTTPS GUI port is published, loopback by default. The Agent container contains no browser, runs as a configured non-root UID/GID, has a read-only root filesystem, drops all capabilities, and mounts only its persistent state directory and read-only Personal Agent secret directory. A Dockerfile-specific ignore list limits the build context to Personal Agent manifests and source. Chromium alone owns `/config` and the Google session.

Linux requires these explicit settings:

- `TRULEOFTWO_AGENT_DATA_DIR`: persistent metadata directory;
- `TRULEOFTWO_AGENT_JOURNAL_PATH`: recovery journal on persistent storage;
- `TRULEOFTWO_AGENT_CREDENTIAL_FILE`: injected Personal Agent credential file;
- `TRULEOFTWO_GEMINI_CDP_ENDPOINT`: loopback or a single-label private container service name such as `http://chromium:9222`;
- `TRULEOFTWO_ALLOW_PRIVATE_CONTAINER_CDP=1`: explicit opt-in for non-loopback single-label CDP names on non-Windows platforms;
- `TRULEOFTWO_BASE_URL`: externally reachable TheRuleOfTwo server origin.

The credential file is not a Google credential. In `run` mode it is read-only and is never rewritten or logged. Linux fails startup if the credential-file setting is missing or the mounted file is unavailable. Relative data, journal, and credential paths are rejected.

### Initial pairing and secret provisioning

Copy `.env.example` to `.env`, fill all required values, and keep it uncommitted. Create private host directories for browser profile, Agent state, and Agent secrets. Their ownership must match `AGENT_UID`/`AGENT_GID`; restrict the state and secret directories to the deployment account.

Build the Agent image:

```sh
cd personal-agent
docker compose config --quiet
docker compose build personal-agent
```

Before normal startup, run the same image once with the secret directory writable so `pair` can atomically create `personal-agent-credential` and persist matching `agent.json` metadata. Substitute the configured absolute paths, UID/GID, and server URL; enter the one-time pairing token only at the stdin prompt.

```sh
docker run --rm -it --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --user <uid>:<gid> \
  -v <agent-state-path>:/var/lib/theruleoftwo-personal-agent:rw \
  -v <agent-secrets-path>:/run/secrets:rw \
  -e TRULEOFTWO_BASE_URL=<https-server-origin> \
  -e TRULEOFTWO_AGENT_DATA_DIR=/var/lib/theruleoftwo-personal-agent \
  -e TRULEOFTWO_AGENT_CREDENTIAL_FILE=/run/secrets/personal-agent-credential \
  theruleoftwo-personal-agent:local pair
```

After pairing, normal Compose startup mounts the secret directory read-only. `TRULEOFTWO_BASE_URL` must be the exact origin used during pairing and must be reachable from the Agent container. Do not use `localhost` or `127.0.0.1` for a separately deployed server: those names refer to the Agent container. Use the existing deployed HTTPS origin. If both deployments share an explicitly configured Docker network, an HTTPS service hostname is also valid. HTTP is accepted only for loopback development and is not a NAS deployment option.

Start Chromium, open its HTTPS GUI from the trusted LAN, and authenticate Google/Gemini manually. Then start the Agent. Startup ordering is not treated as readiness: if Chromium is unavailable, the Agent reports `chrome_unavailable` and does not receive jobs until a later heartbeat reports `ready`. If TheRuleOfTwo is unavailable during initial startup, the process exits and Compose restarts it; later poll/heartbeat failures use the existing retry/reconnect behavior.

```sh
docker compose up -d chromium
docker compose up -d personal-agent
```

Useful operations:

```sh
docker compose ps
docker compose logs --tail=100 chromium personal-agent
docker compose restart personal-agent
docker compose restart chromium
docker compose down                 # preserves bind-mounted state
docker compose up -d
```

Do not add `-v` to `down`, delete either persistent host directory, publish port `9222`, mount the Docker socket, put secrets under source control, expose the GUI to the public internet, or copy anything from Chromium's profile. Preserve both `AGENT_STATE_PATH` and `BROWSER_PROFILE_PATH` across container recreation.

### Runtime configuration contract

| Concern | Setting | Secret | Required behavior |
| --- | --- | --- | --- |
| TheRuleOfTwo connectivity | `TRULEOFTWO_BASE_URL` | No | Exact reachable HTTPS origin used during pairing; never container-localhost for a separate server. |
| Agent authentication | `${AGENT_SECRETS_PATH}/personal-agent-credential` mounted at `/run/secrets/personal-agent-credential` | Yes | Created by `pair`, host-restricted, mounted read-only during normal operation, and never committed. |
| Agent persistent state | `AGENT_STATE_PATH` mounted at `/var/lib/theruleoftwo-personal-agent` | Credential-equivalent metadata/journal | Absolute persistent host path writable by `AGENT_UID:AGENT_GID`; contains `agent.json` and `in-flight.json`. |
| Chromium persistent profile | `BROWSER_PROFILE_PATH` mounted at `/config` | Yes, profile is credential-equivalent | Absolute persistent host path writable by `PUID:PGID`; explicit profile is `/config/chromium-profile`. |
| Chromium GUI | `GUI_BIND_ADDRESS`, `GUI_PORT`, `GUI_USER`, `GUI_PASSWORD` | Password is secret | Bind the exact NAS private-LAN address, not `0.0.0.0`; default port `3001`; HTTPS/self-signed certificate; no forwarding or tunnel. |
| Private CDP | Compose-internal `http://chromium:9222` | No | Available only on `personal-browser`; port `9222` has no host publication. |
| Ownership/timezone | `AGENT_UID`, `AGENT_GID`, `PUID`, `PGID`, `TZ` | No | Numeric IDs must own the corresponding host paths; use an IANA timezone. |

### Pairing and persistence

1. Start TheRuleOfTwo normally and sign in to its Settings page.
2. Under **Personal Agent**, create a one-time pairing token.
3. Run the one-shot `docker run ... pair` command above and enter the token only at the stdin prompt.
4. Confirm that `agent.json` exists under `AGENT_STATE_PATH` and `personal-agent-credential` exists under `AGENT_SECRETS_PATH` without printing either file.
5. Start through Compose. The read-only credential and persistent metadata are reused after restart; re-pair only after explicit revocation, credential rejection, or an intentional server-origin change.

### Non-generating preflight

Run this after Chromium is open, Google/Gemini authentication is complete, and the Agent has appeared online. It does not poll for a job, fill the composer, click Send, or send a Gemini prompt:

```sh
docker compose exec personal-agent node /app/dist/cli.js preflight
```

The command fails unless all of the following hold:

- runtime configuration and pairing metadata are valid;
- the injected Personal Agent credential exists and matches the persisted metadata;
- the existing recovery journal is valid;
- the Agent state directory and journal directory accept a create/sync/delete probe;
- Chromium CDP is reachable and exposes a browser context;
- the Gemini page is hydrated, signed in, and has exactly one usable composer;
- TheRuleOfTwo accepts an authenticated heartbeat at the paired origin.

The heartbeat updates the existing presence/adapter status. `sign_in_required`, `chrome_unavailable`, `gemini_unavailable`, malformed journal data, missing credentials, and server/authentication failures all produce a non-zero result. Preflight may create a fresh Gemini tab when no Gemini tab exists, but it never submits content.

## Recovery and ambiguity safety

The journal phases and recovery semantics are shared by both modes. The Agent persists `send_attempted` before invoking Send. On restart, `send_attempted` and `submitted` recover as `generation.ambiguous` without adapter re-execution; pre-submit phases fail conservatively. If a journal write fails before Send, Send is not invoked. If journal storage cannot be loaded, startup fails rather than polling work.

There is a small acknowledgement window between a successful server event response and local journal cleanup where replay may be rejected as already applied. The entry is retained, the job remains suppressed, and operator/server reconciliation is required.

## Configuration

Optional bounded timeouts are `TRULEOFTWO_GEMINI_HYDRATION_TIMEOUT_MS` (default 15000, maximum 60000) and `TRULEOFTWO_GEMINI_RESPONSE_TIMEOUT_MS` (default 120000, maximum 600000). `TRULEOFTWO_AGENT_JOURNAL_PATH` can override the default `<data-dir>/in-flight.json` in either mode.

## Future NAS E2E acceptance procedure

This is the single controlled runtime test to run after deployment, not during static implementation:

1. Deploy/start TheRuleOfTwo through its normal production deployment.
2. In `personal-agent`, run `docker compose config --quiet`, then `docker compose up -d chromium personal-agent`.
3. Open `https://<NAS-private-LAN-IP>:<GUI_PORT>` from the trusted LAN and authenticate with `GUI_USER`/`GUI_PASSWORD`.
4. Manually authenticate Google/Gemini. Do not export or inspect browser authentication data. Leave exactly one Gemini tab open (the GUI tab may be closed after the browser state is ready).
5. In TheRuleOfTwo Settings, verify **Personal Agent: Online** and **Gemini adapter: Ready**.
6. Run `docker compose exec personal-agent node /app/dist/cli.js preflight` and require `Preflight passed. No Gemini prompt was sent.`
7. In the normal TheRuleOfTwo UI select **Gemini → Personal Account**.
8. Send exactly one prompt whose complete text is `Return exactly:` followed by a newline and `TR2_DOCKER_GEMINI_OK`.
9. From application/Agent records and logs, verify the lifecycle `queued → accepted → submitted_to_provider → completed` with no retry or ambiguity transition.
10. Verify the exact response `TR2_DOCKER_GEMINI_OK` reaches TheRuleOfTwo.
11. Verify the resulting `ProviderConversation` maps/pins the returned Gemini conversation ID, without printing browser credentials or profile contents.
12. Verify `in-flight.json` contains no entry for the completed request (an empty journal is appropriate); do not delete or rewrite the journal manually.
13. Run `docker compose restart personal-agent`; verify it reconnects, returns Online/Ready, and does not replay the completed request.
14. Run `docker compose restart chromium`; verify the persistent profile returns and Gemini is still authenticated, or explicitly record that Google requires manual reauthentication.
15. Run `docker compose down` followed by `docker compose up -d` without deleting `AGENT_STATE_PATH` or `BROWSER_PROFILE_PATH`. Verify the Agent returns, the Chromium profile returns, Gemini remains authenticated or explicitly requests reauthentication, and no Agent safety state is silently lost.
16. Use Synology Container Manager or `docker stats --no-stream` to record approximate CPU and RAM for both containers at idle, with Gemini open, and during one normal response. Resource observations are measurements, not pass/fail limits unless a limit is agreed before the test.

Stop and record evidence rather than resending if any state after Send is uncertain. A second live prompt is not part of this acceptance procedure.

## Validation status

- **IMPLEMENTED / STATICALLY VALIDATED:** container wiring, persistent mounts, private CDP configuration, pairing contract, presence semantics, reconnect behavior, non-generating preflight, and durable recovery behavior.
- **LOCAL CONTAINER RUNTIME VALIDATED:** NO unless separately reported with runtime evidence.
- **LIVE GEMINI VALIDATED:** NO.
- **NAS RUNTIME VALIDATED:** NO. The procedure above is the next gate.
