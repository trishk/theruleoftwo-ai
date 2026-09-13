"use client";

import { useState, useTransition } from "react";

import {
  createPersonalAgentPairingToken,
  revokeCurrentPersonalAgent,
} from "@/app/actions";

type Props = {
  agent: {
    paired: boolean;
    online: boolean;
    lastSeenAt: string | null;
    adapterStatus: string | null;
    revoked: boolean;
  } | null;
};

const statusLabels: Record<string, string> = {
  ready: "Ready",
  chrome_unavailable: "Chrome unavailable",
  sign_in_required: "Gemini sign-in required",
  gemini_unavailable: "Gemini unavailable",
};

export function PersonalAgentSection({ agent }: Props) {
  const [pairing, setPairing] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeAgent = agent?.paired && !agent.revoked;

  function createToken() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPersonalAgentPairingToken();
        setPairing({ token: result.pairingToken, expiresAt: result.expiresAt });
      } catch {
        setError("Could not create a pairing token.");
      }
    });
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      try {
        await revokeCurrentPersonalAgent();
        setPairing(null);
      } catch {
        setError("Could not revoke the personal agent.");
      }
    });
  }

  return (
    <section className="mb-10" aria-labelledby="personal-agent-heading">
      <h2 id="personal-agent-heading" className="text-lg font-medium">
        Personal Agent
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pair an outbound Windows agent. Personal Account generation is not enabled yet.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Pairing</dt>
            <dd>{activeAgent ? "Paired" : "Not paired"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Presence</dt>
            <dd>{activeAgent ? (agent.online ? "Online" : "Offline") : "Unavailable"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Gemini adapter</dt>
            <dd>{activeAgent && agent.adapterStatus
              ? statusLabels[agent.adapterStatus] ?? "Unknown"
              : "Not reported"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd>{activeAgent && agent.lastSeenAt
              ? new Date(agent.lastSeenAt).toLocaleString("en-US", { timeZone: "UTC" })
              : "Never"}</dd>
          </div>
        </dl>

        {pairing && (
          <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">One-time pairing token</p>
            <code className="mt-2 block break-all text-xs" data-testid="pairing-token">
              {pairing.token}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter this in the agent before {new Date(pairing.expiresAt).toLocaleTimeString("en-US", { timeZone: "UTC", timeZoneName: "short" })}.
              It will not be shown again after leaving this page.
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500" role="alert">{error}</p>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={createToken}
            disabled={isPending}
            className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:min-h-10"
          >
            {activeAgent ? "Pair again" : "Create pairing token"}
          </button>
          {activeAgent && (
            <button
              type="button"
              onClick={revoke}
              disabled={isPending}
              className="min-h-11 rounded-md border border-border px-4 text-sm font-medium text-destructive disabled:opacity-50 sm:min-h-10"
            >
              Revoke agent
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
