"use client";

import { useState } from "react";
import {
  Moon,
  Sun,
} from "lucide-react";

type Theme =
  | "dark"
  | "light";

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

  const isDark =
    theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        isDark
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      title={
        isDark
          ? "Light mode"
          : "Dark mode"
      }
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {isDark ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  );
}