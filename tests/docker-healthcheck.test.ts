// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production Docker healthcheck", () => {
  it("continues to probe the public database health endpoint", async () => {
    const sources = await Promise.all(
      ["Dockerfile", "docker-compose.yml"].map((file) =>
        readFile(path.resolve(file), "utf8")
      )
    );

    for (const source of sources) {
      expect(source).toContain(
        "fetch('http://127.0.0.1:3000/api/health'"
      );
      expect(source).toContain("redirect:'manual'");
      expect(source).toContain("r.status!==200");
      expect(source).toContain("(await r.json()).status!=='ok'");
    }
  });
});
