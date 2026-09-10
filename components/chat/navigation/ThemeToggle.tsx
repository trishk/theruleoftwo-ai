"use client";

import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
} from "lucide-react";

type Theme =
  | "dark"
  | "light";

const themeChangeEvent = "theruleoftwo:theme-change";

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function announceThemeChange(theme: Theme) {
  window.dispatchEvent(new CustomEvent(themeChangeEvent, { detail: theme }));
}

export function ThemeToggle() {
  const [theme, setTheme] =
    useState<Theme>("dark");

  useEffect(() => {
    let savedTheme: Theme = "dark";

    function handleThemeChange(event: Event) {
      const nextTheme = (event as CustomEvent<unknown>).detail;
      if (isTheme(nextTheme)) setTheme(nextTheme);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== "theme" || !isTheme(event.newValue)) return;

      applyTheme(event.newValue);
      announceThemeChange(event.newValue);
    }

    window.addEventListener(themeChangeEvent, handleThemeChange);
    window.addEventListener("storage", handleStorage);

    try {
      const storedTheme = localStorage.getItem("theme");
      if (isTheme(storedTheme)) {
        savedTheme = storedTheme;
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browsing contexts.
    }

    applyTheme(savedTheme);
    announceThemeChange(savedTheme);

    return () => {
      window.removeEventListener(themeChangeEvent, handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function toggleTheme() {
    const nextTheme: Theme =
      document.documentElement.classList.contains("dark")
        ? "light"
        : "dark";

    try {
      localStorage.setItem(
        "theme",
        nextTheme
      );
    } catch {
      // Keep the in-memory choice usable even when storage is unavailable.
    }

    applyTheme(nextTheme);
    announceThemeChange(nextTheme);
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
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 md:h-9 md:w-9"
    >
      {isDark ? (
        <Moon aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Sun aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}
