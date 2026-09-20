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

After pairing, normal Compose startup mounts the secret directory read-only. Start Chromium first, open its HTTPS GUI, and authenticate Google/Gemini manually. Start the Agent only after the Gemini page is ready.

```sh
docker compose up -d chromium
docker compose up -d personal-agent
```

Do not publish port `9222`, mount the Docker socket, put secrets under source control, expose the GUI to the public internet, or copy anything from Chromium's profile. Preserve both `AGENT_STATE_PATH` and `BROWSER_PROFILE_PATH` across container recreation.

## Recovery and ambiguity safety

The journal phases and recovery semantics are shared by both modes. The Agent persists `send_attempted` before invoking Send. On restart, `send_attempted` and `submitted` recover as `generation.ambiguous` without adapter re-execution; pre-submit phases fail conservatively. If a journal write fails before Send, Send is not invoked. If journal storage cannot be loaded, startup fails rather than polling work.

There is a small acknowledgement window between a successful server event response and local journal cleanup where replay may be rejected as already applied. The entry is retained, the job remains suppressed, and operator/server reconciliation is required.

## Configuration

Optional bounded timeouts are `TRULEOFTWO_GEMINI_HYDRATION_TIMEOUT_MS` (default 15000, maximum 60000) and `TRULEOFTWO_GEMINI_RESPONSE_TIMEOUT_MS` (default 120000, maximum 600000). `TRULEOFTWO_AGENT_JOURNAL_PATH` can override the default `<data-dir>/in-flight.json` in either mode.

## Validation status

Docker/Linux support is **implemented but not NAS runtime validated**. No live Gemini generation is part of Increment 2C. Runtime validation of the Chromium GUI, private CDP connection, manual authentication, restart persistence, and resource use remains a later Synology gate.
