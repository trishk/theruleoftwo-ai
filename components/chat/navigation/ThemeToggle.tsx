"use client";

import { useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] =
    useState<Theme>("dark");

  function toggleTheme() {
    const nextTheme: Theme =
      theme === "dark"
        ? "light"
        : "dark";

    setTheme(nextTheme);

    localStorage.setItem(
      "theme",
      nextTheme
    );

    document.documentElement.classList.toggle(
      "dark",
      nextTheme === "dark"
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${
        theme === "dark"
          ? "light"
          : "dark"
      } mode`}
      className="flex w-full items-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span>
        {theme === "dark"
          ? "☾ Dark mode"
          : "☀ Light mode"}
      </span>
    </button>
  );
}