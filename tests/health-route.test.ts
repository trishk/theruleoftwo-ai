// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRawUnsafe: queryRawMock },
}));

import {
  GET,
  createHealthResponse,
} from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => queryRawMock.mockReset());

  it("returns a minimal success response after a DB probe", async () => {
    queryRawMock.mockResolvedValue([{ 1: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed without exposing the database error", async () => {
    const response = await createHealthResponse(async () => {
      throw new Error("sensitive database location");
    });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain("sensitive");
  });
});
