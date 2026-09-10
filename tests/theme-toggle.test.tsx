// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

import { ThemeToggle } from "@/components/chat/navigation/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.add("dark");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to dark and switches to light with persistence", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Switch to light mode" });
    fireEvent.click(button);

    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(button).toHaveAccessibleName("Switch to dark mode");
    expect(button).toHaveAttribute("title", "Switch to dark mode");
  });

  it("switches from a saved light preference back to dark", async () => {
    localStorage.setItem("theme", "light");
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", { name: "Switch to dark mode" });
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.click(button);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(button).toHaveAccessibleName("Switch to light mode");
    expect(button).toHaveAttribute("title", "Switch to light mode");
  });

  it("reapplies a persisted preference after remount", async () => {
    const firstRender = render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    firstRender.unmount();
    document.documentElement.classList.add("dark");

    render(<ThemeToggle />);
    await screen.findByRole("button", { name: "Switch to dark mode" });
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("falls back to dark for an invalid preference", async () => {
    localStorage.setItem("theme", "sepia");
    document.documentElement.classList.remove("dark");
    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to light mode");
  });

  it("does not crash when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Unavailable");
    });

    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to light mode" });
    fireEvent.click(button);

    expect(button).toHaveAccessibleName("Switch to dark mode");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("applies a valid cross-tab storage change", () => {
    render(<ThemeToggle />);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "theme",
        newValue: "light",
      }));
    });

    expect(document.documentElement).not.toHaveClass("dark");
    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to dark mode");
  });

  it("ignores an invalid cross-tab storage value", () => {
    render(<ThemeToggle />);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "theme",
        newValue: "sepia",
      }));
    });

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to light mode");
  });

  it("removes the storage listener on unmount", () => {
    const rendered = render(<ThemeToggle />);
    rendered.unmount();

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "theme",
        newValue: "light",
      }));
    });

    expect(document.documentElement).toHaveClass("dark");
  });
});
