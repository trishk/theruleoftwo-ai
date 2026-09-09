// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("@/app/actions", () => ({
  saveIntegrationApiKey: vi.fn(),
  updateSelectedModel: vi.fn(),
}));

import { AddIntegration } from "@/components/settings/AddIntegration";
import { AddIntegrationSection } from "@/components/settings/AddIntegrationSection";
import { ModelSelect } from "@/components/settings/ModelSelect";

it("contains mobile-width controls and preserves compact desktop variants", () => {
  render(
    <>
      <AddIntegrationSection configuredProviders={[]} />
      <ModelSelect provider="openai" models={["model-one"]} selectedModel="model-one" />
    </>
  );

  expect(screen.getByRole("button", { name: "Add integration" })).toHaveClass(
    "min-h-11",
    "sm:h-9"
  );
  expect(screen.getByRole("combobox")).toHaveClass(
    "h-11",
    "w-full",
    "max-w-full",
    "sm:h-9",
    "sm:w-auto"
  );
});

it("announces and associates an integration validation error once", () => {
  render(<AddIntegration configuredProviders={[]} onClose={() => {}} />);
  const apiKey = screen.getByLabelText("API key");

  fireEvent.keyDown(apiKey, { key: "Enter" });

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("API key is required.");
  expect(apiKey).toHaveAttribute("aria-describedby", alert.id);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Close" })).toHaveClass("h-11", "w-11");
});

it("moves focus into Add integration and returns it after Cancel", () => {
  render(<AddIntegrationSection configuredProviders={[]} />);
  const addButton = screen.getByRole("button", { name: "Add integration" });

  fireEvent.click(addButton);
  expect(screen.getByLabelText("Provider")).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Add integration" })).toHaveFocus();
});

it("keeps Cancel before Save in DOM, visual, and keyboard order", () => {
  render(<AddIntegration configuredProviders={[]} onClose={() => {}} />);
  const cancel = screen.getByRole("button", { name: "Cancel" });
  const save = screen.getByRole("button", { name: "Save integration" });
  const container = cancel.parentElement;
  fireEvent.change(screen.getByLabelText("API key"), {
    target: { value: "test-key" },
  });

  expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container).toHaveClass("flex-col", "sm:flex-row");
  expect(container?.className).not.toMatch(
    /(?:flex-(?:col|row)-reverse|(?:^|\s)order-\S+)/
  );
  expect(cancel.className).not.toMatch(/(?:^|\s)order-\S+/);
  expect(save.className).not.toMatch(/(?:^|\s)order-\S+/);

  cancel.focus();
  expect(cancel).toHaveFocus();
  save.focus();
  expect(save).toHaveFocus();
});
