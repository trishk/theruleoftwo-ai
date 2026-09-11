// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("repository secrets hardening", () => {
  it("keeps the public environment template empty", async () => {
    const template = await readFile(
      path.resolve(".env.example"),
      "utf8"
    );
    const assignments = template
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => line && !line.startsWith("#")
      );

    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      expect(assignment).toMatch(
        /^[A-Z][A-Z0-9_]*=$/
      );
    }
  });

  it("contains no development database literal in E2E specs", async () => {
    for (const file of [
      "e2e/realtime-chat.spec.ts",
      "e2e/chat-auto-scroll.spec.ts",
      "e2e/invite-guest.spec.ts",
    ]) {
      const source = await readFile(path.resolve(file), "utf8");
      expect(source).not.toContain("dev.db");
    }
  });
});
