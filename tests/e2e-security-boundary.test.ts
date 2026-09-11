// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  E2E_SUPABASE_GUARD_ERROR,
  assertSafeE2ESupabaseProject,
  createGuardedE2EAdminClient,
} from "@/e2e/supabase-safety";
import {
  E2E_CALLBACK_URL,
  E2E_ORIGIN,
  assertConsistentE2EOrigins,
  createE2EWebServerEnvironment,
} from "@/e2e/config.mjs";

const projectRef = "abcdefghijklmnopqrst";
const safeInput = {
  nodeEnv: "test",
  e2eTesting: "1",
  publicUrl: `https://${projectRef}.supabase.co`,
  allowedProjectRef: projectRef,
};

const rejectedInputs = [
  ["missing E2E mode", { e2eTesting: undefined }],
  ["production", { nodeEnv: "production" }],
  ["missing runtime environment", { nodeEnv: undefined }],
  ["invalid URL", { publicUrl: "not-a-url" }],
  ["missing allowlist", { allowedProjectRef: undefined }],
  ["malformed allowlist", { allowedProjectRef: "invalid" }],
  ["project mismatch", { allowedProjectRef: "zzzzzzzzzzzzzzzzzzzz" }],
  ["userinfo", { publicUrl: `https://user@${projectRef}.supabase.co` }],
  ["explicit port", { publicUrl: `https://${projectRef}.supabase.co:444` }],
  ["query string", { publicUrl: `https://${projectRef}.supabase.co?x=1` }],
  ["fragment", { publicUrl: `https://${projectRef}.supabase.co#x` }],
  ["hostname suffix", { publicUrl: `https://${projectRef}.supabase.co.evil.test` }],
  ["hostname in path", { publicUrl: `https://evil.test/${projectRef}.supabase.co` }],
  ["non-HTTPS", { publicUrl: `http://${projectRef}.supabase.co` }],
  ["additional path", { publicUrl: `https://${projectRef}.supabase.co/path` }],
  ["uppercase project ref", { allowedProjectRef: "ABCDEFGHIJKLMNOPQRST" }],
] as const;

describe("E2E Supabase safety boundary", () => {
  it.each(rejectedInputs)("rejects %s", (_name, overrides) => {
    const createAdminClient = vi.fn();
    expect(() =>
      createGuardedE2EAdminClient(
        { ...safeInput, ...overrides },
        createAdminClient
      )
    ).toThrow(E2E_SUPABASE_GUARD_ERROR);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("accepts only an exact project-ref match", () => {
    expect(() =>
      assertSafeE2ESupabaseProject(safeInput)
    ).not.toThrow();
  });

  it("does not include supplied values in failures", () => {
    const suppliedUrl = "https://sensitive.invalid/path";
    const suppliedRef = "sensitive-project-ref";

    let message = "";
    try {
      assertSafeE2ESupabaseProject({
        ...safeInput,
        publicUrl: suppliedUrl,
        allowedProjectRef: suppliedRef,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe(E2E_SUPABASE_GUARD_ERROR);
    expect(message).not.toContain(suppliedUrl);
    expect(message).not.toContain(suppliedRef);
  });

  it("guards before constructing the admin client", async () => {
    const source = await readFile(path.resolve("e2e/auth.ts"), "utf8");
    const guardCall = source.indexOf("createGuardedE2EAdminClient(");
    const clientCall = source.indexOf("return createClient(");

    expect(guardCall).toBeGreaterThan(-1);
    expect(clientCall).toBeGreaterThan(guardCall);
  });

  it("uses one origin for browser, server, callback, and app redirect", () => {
    const webServerEnvironment =
      createE2EWebServerEnvironment();
    expect(() =>
      assertConsistentE2EOrigins({
        baseURL: E2E_ORIGIN,
        webServerUrl: E2E_ORIGIN,
        appUrl: webServerEnvironment.APP_URL,
        callbackUrl: E2E_CALLBACK_URL,
      })
    ).not.toThrow();
  });

  it("keeps callback success and error redirects on configured APP_URL", async () => {
    const callback = await readFile(
      path.resolve("app/auth/callback/route.ts"),
      "utf8"
    );
    expect(callback.match(/process\.env\.APP_URL/g)).toHaveLength(2);
    expect(createE2EWebServerEnvironment().APP_URL).toBe(E2E_ORIGIN);
  });

  it.each([
    [undefined, E2E_ORIGIN],
    ["http://localhost:3000", E2E_ORIGIN],
    [E2E_ORIGIN, "http://localhost:3000"],
  ])("rejects missing or divergent APP/base origins", (appUrl, baseURL) => {
    expect(() =>
      assertConsistentE2EOrigins({
        baseURL,
        webServerUrl: E2E_ORIGIN,
        appUrl,
        callbackUrl: E2E_CALLBACK_URL,
      })
    ).toThrow("E2E origins are not configured consistently.");
  });

  it("uses no credential-bearing E2E login URL", async () => {
    for (const file of [
      "e2e/authenticated-user.spec.ts",
      "e2e/homepage.spec.ts",
      "proxy.ts",
    ]) {
      const source = await readFile(path.resolve(file), "utf8");
      expect(source).not.toContain("/e2e-login?");
    }
  });

  it("uses magic links and preserves the callback exchange", async () => {
    const auth = await readFile(path.resolve("e2e/auth.ts"), "utf8");
    const callback = await readFile(
      path.resolve("app/auth/callback/route.ts"),
      "utf8"
    );

    expect(auth).toContain("createE2ELoginLink");
    expect(callback).toContain("exchangeCodeForSession");
  });

  it("does not pass the administrator credential to production Docker", async () => {
    const compose = await readFile(
      path.resolve("docker-compose.yml"),
      "utf8"
    );

    expect(compose).not.toContain("SUPABASE_SECRET_KEY");
  });
});
