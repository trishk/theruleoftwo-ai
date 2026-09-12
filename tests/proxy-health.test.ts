// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("auth proxy health exemption", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: null } });
  });

  it("allows unauthenticated health checks without a redirect or auth lookup", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/api/health")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it.each(["/", "/settings", "/api/chat/usage"])(
    "keeps the unrelated route %s protected",
    async (pathname) => {
      const response = await proxy(
        new NextRequest(`http://localhost${pathname}`)
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/login"
      );
      expect(getUserMock).toHaveBeenCalledTimes(1);
    }
  );
});
