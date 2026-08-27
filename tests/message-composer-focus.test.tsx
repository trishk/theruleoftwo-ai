// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import {
  expect,
  it,
  vi,
} from "vitest";

import "@testing-library/jest-dom/vitest";

import { MessageComposer } from "@/components/chat/composer/MessageComposer";

const noop = () => {};

function createDeferred() {
  let resolve = () => {};
  const promise = new Promise<void>(
    (resolvePromise) => {
      resolve = resolvePromise;
    }
  );

  return { promise, resolve };
}

function ComposerHarness({
  onSubmit = vi.fn(async () => {}),
}: {
  onSubmit?: () => Promise<void>;
}) {
  const [message, setMessage] =
    useState("");
  const [sending, setSending] =
    useState(false);

  return (
    <MessageComposer
      message={message}
      sending={sending}
      error={null}
      replyTo={null}
      configuredProviders={[]}
      onMessageChange={setMessage}
      onCancelReply={noop}
      onSubmit={async () => {
        setMessage("");
        setSending(true);
        await onSubmit();
        setSending(false);
      }}
      onStopGeneration={noop}
    />
  );
}

it("focuses the composer after sending with Enter", async () => {
  const submission = createDeferred();

  render(
    <ComposerHarness
      onSubmit={() => submission.promise}
    />
  );

  const textarea = screen.getByPlaceholderText(
    "Ask for another perspective..."
  );

  fireEvent.change(textarea, {
    target: { value: "First message" },
  });
  textarea.focus();
  fireEvent.keyDown(textarea, {
    key: "Enter",
  });

  await waitFor(() =>
    expect(textarea).toBeDisabled()
  );
  screen.getByRole("button", {
    name: "Stop generation",
  }).focus();
  await act(async () => {
    submission.resolve();
  });

  expect(textarea).toBeEnabled();
  expect(textarea).toHaveFocus();
});

it("shows actionable setup guidance while keeping human-only send enabled", () => {
  render(<ComposerHarness />);

  expect(screen.getByText(/No AI providers are connected/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Configure Integrations" })).toHaveAttribute(
    "href",
    "/settings#integrations"
  );

  const textarea = screen.getByPlaceholderText("Ask for another perspective...");
  fireEvent.change(textarea, { target: { value: "Hello humans" } });
  expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
});

it("accepts the next message immediately after an Enter submission", async () => {
  const submission = createDeferred();

  render(
    <ComposerHarness
      onSubmit={() => submission.promise}
    />
  );

  const textarea = screen.getByPlaceholderText(
    "Ask for another perspective..."
  );

  fireEvent.change(textarea, {
    target: { value: "First message" },
  });
  textarea.focus();
  fireEvent.keyDown(textarea, {
    key: "Enter",
  });

  await waitFor(() =>
    expect(textarea).toBeDisabled()
  );
  screen.getByRole("button", {
    name: "Stop generation",
  }).focus();
  await act(async () => {
    submission.resolve();
  });
  fireEvent.change(textarea, {
    target: { value: "Second message" },
  });

  expect(textarea).toHaveFocus();
  expect(textarea).toHaveValue(
    "Second message"
  );
});

it("keeps focus and inserts a newline with Shift+Enter without submitting", () => {
  const onSubmit = vi.fn(async () => {});

  render(
    <ComposerHarness
      onSubmit={onSubmit}
    />
  );

  const textarea = screen.getByPlaceholderText(
    "Ask for another perspective..."
  );

  fireEvent.change(textarea, {
    target: { value: "First line" },
  });
  textarea.focus();
  fireEvent.keyDown(textarea, {
    key: "Enter",
    shiftKey: true,
  });
  fireEvent.change(textarea, {
    target: { value: "First line\n" },
  });

  expect(onSubmit).not.toHaveBeenCalled();
  expect(textarea).toHaveFocus();
  expect(textarea).toHaveValue(
    "First line\n"
  );
});

it("uses at least 16px font size on mobile to prevent iOS Safari auto-zoom while supporting desktop styling", () => {
  render(<ComposerHarness />);

  const textarea = screen.getByPlaceholderText(
    "Ask for another perspective..."
  );

  expect(textarea).toHaveClass("text-base");
  expect(textarea).toHaveClass("md:text-sm");
});
