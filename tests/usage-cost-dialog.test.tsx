// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageCostDialog } from "@/components/chat/navigation/UsageCostDialog";

const summary = (overrides = {}) => ({ knownEstimatedCost: null, knownAttemptCount: 0, unknownAttemptCount: 0, pendingAttemptCount: 0, legacyAttemptCount: 0, providerInvokedAttemptCount: 1, ...overrides });
const emptyResponse = () => Promise.resolve(new Response(JSON.stringify({ breakdown: [] }), { status: 200 }));

describe("UsageCostDialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [summary({ knownEstimatedCost: "$1.25", knownAttemptCount: 1 }), /estimated \$1\.25/i],
    [summary({ pendingAttemptCount: 1 }), /calculating cost/i],
    [summary({ unknownAttemptCount: 1 }), /cost unavailable.*1 unknown/i],
    [summary({ knownEstimatedCost: "$1.25", knownAttemptCount: 1, pendingAttemptCount: 2, unknownAttemptCount: 3 }), /2 calculating.*3 unknown/i],
  ])("renders the summary state %#", (value, name) => {
    vi.stubGlobal("fetch", vi.fn(emptyResponse));
    render(<UsageCostDialog conversationId={1} summary={value} />);
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches only when opened and exposes accessible loading, title, description, close, and error states", async () => {
    let reject!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, rejected) => { reject = () => rejected(new Error("nope")); })));
    render(<UsageCostDialog conversationId={7} summary={summary({ pendingAttemptCount: 1 })} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /calculating cost/i }));
    expect(await screen.findByRole("dialog", { name: /usage & estimated cost/i })).toBeInTheDocument();
    expect(screen.getByText(/provider invoice is authoritative/i)).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    reject();
    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load/i);
    fireEvent.click(screen.getByRole("button", { name: /close usage and cost dialog/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("aborts an in-flight request when unmounted", () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = (init as RequestInit).signal as AbortSignal; return new Promise<Response>(() => undefined); }));
    const view = render(<UsageCostDialog conversationId={1} summary={summary({ pendingAttemptCount: 1 })} />);
    fireEvent.click(screen.getByRole("button", { name: /calculating cost/i }));
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
