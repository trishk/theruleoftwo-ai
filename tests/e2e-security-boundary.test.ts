// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isE2ELoginEnabled } from "@/lib/security/e2e-login";

describe("E2E login security boundary", () => {
  it("blocks production even when E2E testing is enabled", () => {
    expect(
      isE2ELoginEnabled("production", "1")
    ).toBe(false);
  });

  it("blocks development when the opt-in flag is absent", () => {
    expect(
      isE2ELoginEnabled("development", undefined)
    ).toBe(false);
  });

  it("allows development only with the exact opt-in value", () => {
    expect(
      isE2ELoginEnabled("development", "1")
    ).toBe(true);
  });

  it("enables the flag automatically for the managed Playwright server", async () => {
    const config = await readFile(
      path.resolve("playwright.config.ts"),
      "utf8"
    );

    expect(config).toMatch(
      /env:\s*\{\s*E2E_TESTING:\s*"1"/
    );
    expect(config).toMatch(
      /reuseExistingServer:\s*false/
    );
  });

  it("does not pass the Supabase secret key to the production container", async () => {
    const compose = await readFile(
      path.resolve("docker-compose.yml"),
      "utf8"
    );

    expect(compose).not.toContain(
      "SUPABASE_SECRET_KEY"
    );
  });
});
