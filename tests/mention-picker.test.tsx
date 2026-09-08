// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

import { MessageComposer } from "@/components/chat/composer/MessageComposer";
import type { Provider } from "@/lib/llm/types";

function Harness({
  initialMessage = "",
  configuredProviders = ["openai", "anthropic", "google"],
  sending = false,
  onSubmit = vi.fn(async () => {}),
}: {
  initialMessage?: string;
  configuredProviders?: Provider[];
  sending?: boolean;
  onSubmit?: () => Promise<void>;
}) {
  const [message, setMessage] = useState(initialMessage);

  return (
    <MessageComposer
      message={message}
      sending={sending}
      error={null}
      replyTo={null}
      configuredProviders={configuredProviders}
      onMessageChange={setMessage}
      onCancelReply={() => {}}
      onSubmit={onSubmit}
      onStopGeneration={() => {}}
    />
  );
}

function composer() {
  return screen.getByRole("combobox", { name: "Message" });
}

function typeAtCaret(value: string, caret = value.length) {
  fireEvent.change(composer(), {
    target: { value, selectionStart: caret, selectionEnd: caret },
  });
}

describe("AI mention picker", () => {
  it("opens from an active @ token and exposes combobox semantics", () => {
    render(<Harness />);

    typeAtCaret("@");

    expect(composer()).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "AI mentions" });
    expect(composer()).toHaveAttribute("aria-controls", listbox.id);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(composer()).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[0].id
    );
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("opens from the discoverability trigger and inserts @ at the caret", () => {
    render(<Harness initialMessage="Hello world" />);
    const textarea = composer() as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(5, 5);

    fireEvent.click(screen.getByRole("button", { name: "Mention an AI" }));

    expect(textarea).toHaveValue("Hello @ world");
    expect(textarea.selectionStart).toBe(7);
    expect(textarea).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps filtering after the trigger inserts a lexical delimiter", () => {
    render(<Harness initialMessage="Hello" />);
    const textarea = composer() as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(5, 5);

    fireEvent.click(screen.getByRole("button", { name: "Mention an AI" }));
    expect(textarea).toHaveValue("Hello @");

    typeAtCaret("Hello @cl");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveAccessibleName(/Claude/);
  });

  it("does not duplicate an existing delimiter and replaces selected text", () => {
    render(<Harness initialMessage="Hello world" />);
    const textarea = composer() as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(6, 11);

    fireEvent.click(screen.getByRole("button", { name: "Mention an AI" }));

    expect(textarea).toHaveValue("Hello @");
    expect(textarea.selectionStart).toBe(7);
    expect(textarea).toHaveFocus();
  });

  it.each([
    ["display name", "@chat", "ChatGPT"],
    ["mention token", "@clau", "Claude"],
    ["provider ID", "@anth", "Claude"],
  ])("filters by %s", (_label, value, expectedName) => {
    render(<Harness />);
    typeAtCaret(value);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(new RegExp(expectedName));
  });

  it("shows only configured providers", () => {
    render(<Harness configuredProviders={["google"]} />);
    typeAtCaret("@");

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveAccessibleName(/Gemini/);
    expect(screen.queryByText("ChatGPT")).not.toBeInTheDocument();
  });

  it("wraps Arrow navigation and selects with Enter without submitting", () => {
    const onSubmit = vi.fn(async () => {});
    render(<Harness onSubmit={onSubmit} />);
    typeAtCaret("@");

    fireEvent.keyDown(composer(), { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: /Gemini/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fireEvent.keyDown(composer(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /ChatGPT/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fireEvent.keyDown(composer(), { key: "Enter" });

    expect(composer()).toHaveValue("@chatgpt ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("selects with Tab and keeps focus in the textarea", () => {
    render(<Harness />);
    typeAtCaret("@gem");
    composer().focus();

    fireEvent.keyDown(composer(), { key: "Tab" });

    expect(composer()).toHaveValue("@gemini ");
    expect(composer()).toHaveFocus();
  });

  it("closes with Escape without changing the message", () => {
    render(<Harness />);
    typeAtCaret("@cl");

    fireEvent.keyDown(composer(), { key: "Escape" });

    expect(composer()).toHaveValue("@cl");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects with click while preserving textarea focus", () => {
    render(<Harness />);
    typeAtCaret("@");
    composer().focus();

    fireEvent.click(screen.getByRole("option", { name: /Claude/ }));

    expect(composer()).toHaveValue("@claude ");
    expect(composer()).toHaveFocus();
  });

  it.each([
    ["start", "@cl message", 3, "@claude message", 7],
    ["middle", "Ask @cl now", 7, "Ask @claude now", 11],
    ["end", "Ask @cl", 7, "Ask @claude ", 12],
  ])(
    "replaces only the active fragment at the %s",
    (_label, value, caret, expected, expectedCaret) => {
      render(<Harness />);
      typeAtCaret(value, caret);

      fireEvent.click(screen.getByRole("option", { name: /Claude/ }));

      expect(composer()).toHaveValue(expected);
      expect((composer() as HTMLTextAreaElement).selectionStart).toBe(expectedCaret);
    }
  );

  it("preserves other mentions and surrounding text", () => {
    render(<Harness />);
    typeAtCaret("@chatgpt ask @ge later", 16);

    fireEvent.click(screen.getByRole("option", { name: /Gemini/ }));

    expect(composer()).toHaveValue("@chatgpt ask @gemini later");
  });

  it("announces an empty filtered result without exposing an active option", () => {
    render(<Harness />);
    typeAtCaret("@missing");

    expect(screen.getByRole("status")).toHaveTextContent("No matching AI");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(composer()).not.toHaveAttribute("aria-activedescendant");
  });

  it("closes an empty result and submits normally with Enter", () => {
    const onSubmit = vi.fn(async () => {});
    render(<Harness onSubmit={onSubmit} />);
    typeAtCaret("@missing");

    fireEvent.keyDown(composer(), { key: "Enter" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(composer()).toHaveValue("@missing");
  });

  it("closes an empty result and allows native Tab navigation", () => {
    render(<Harness />);
    typeAtCaret("@missing");

    const wasNotCancelled = fireEvent.keyDown(composer(), { key: "Tab" });

    expect(wasNotCancelled).toBe(true);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(composer()).toHaveValue("@missing");
  });

  it("disables the textarea and trigger while sending", () => {
    render(<Harness sending />);

    expect(composer()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mention an AI" })).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("constrains the anchored list for narrow mobile viewports", () => {
    render(<Harness />);
    typeAtCaret("@");

    expect(screen.getByRole("listbox")).toHaveClass(
      "absolute",
      "inset-x-2",
      "max-h-52",
      "overflow-y-auto",
      "overflow-x-hidden"
    );
    expect(screen.getByTestId("composer-shell")).toHaveClass(
      "relative",
      "w-full",
      "min-w-0"
    );
  });
});
