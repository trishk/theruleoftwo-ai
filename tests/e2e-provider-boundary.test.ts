// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isSafeE2EMode } from "@/lib/llm/e2e-mode";

const projectRef = "abcdefghijklmnopqrst";
const safe = {
  NODE_ENV: "test",
  E2E_TESTING: "1",
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  E2E_ALLOWED_SUPABASE_PROJECT_REF: projectRef,
} as NodeJS.ProcessEnv;

describe("deterministic E2E provider boundary", () => {
  it("opens only behind the complete existing E2E safety boundary", () => {
    expect(isSafeE2EMode(safe)).toBe(true);
  });

  it.each([
    { E2E_TESTING: undefined },
    { NODE_ENV: "production" },
    { E2E_ALLOWED_SUPABASE_PROJECT_REF: "zzzzzzzzzzzzzzzzzzzz" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.com" },
  ])("fails closed for unsafe configuration", (override) => {
    expect(
      isSafeE2EMode({
        ...safe,
        ...override,
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });
});
