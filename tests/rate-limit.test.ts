import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  upsertMock,
  deleteManyMock,
} = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rateLimitBucket: {
      upsert: upsertMock,
      deleteMany: deleteManyMock,
    },
  },
}));

import {
  checkDailyQuota,
  checkRateLimit,
} from "@/lib/security/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date(
        "2026-08-19T10:00:30.000Z"
      )
    );

    deleteManyMock.mockResolvedValue({
      count: 0,
    });
  });

  it("allows the first request", async () => {
    upsertMock.mockResolvedValue({
      count: 1,
    });

    const result =
      await checkRateLimit(
        "llm:user-1"
      );

    expect(result).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("allows the twentieth request", async () => {
    upsertMock.mockResolvedValue({
      count: 20,
    });

    const result =
      await checkRateLimit(
        "llm:user-1"
      );

    expect(result.allowed).toBe(
      true
    );
  });

  it("blocks the twenty-first request", async () => {
    upsertMock.mockResolvedValue({
      count: 21,
    });

    const result =
      await checkRateLimit(
        "llm:user-1"
      );

    expect(result.allowed).toBe(
      false
    );
  });

  it("returns retry-after until the end of the current window", async () => {
    upsertMock.mockResolvedValue({
      count: 21,
    });

    const result =
      await checkRateLimit(
        "llm:user-1"
      );

    expect(
      result.retryAfterSeconds
    ).toBe(30);
  });

  it("uses the current minute as the rate-limit bucket", async () => {
    upsertMock.mockResolvedValue({
      count: 1,
    });

    await checkRateLimit(
      "llm:user-1"
    );

    expect(
      upsertMock
    ).toHaveBeenCalledWith({
      where: {
        key_windowStart: {
          key: "llm:user-1",
          windowStart:
            new Date(
              "2026-08-19T10:00:00.000Z"
            ),
        },
      },
      create: {
        key: "llm:user-1",
        windowStart:
          new Date(
            "2026-08-19T10:00:00.000Z"
          ),
        count: 1,
      },
      update: {
        count: {
          increment: 1,
        },
      },
      select: {
        count: true,
      },
    });
  });

  it("uses a new bucket in the next window", async () => {
    upsertMock.mockResolvedValue({
      count: 1,
    });

    await checkRateLimit(
      "llm:user-1"
    );

    vi.setSystemTime(
      new Date(
        "2026-08-19T10:01:05.000Z"
      )
    );

    await checkRateLimit(
      "llm:user-1"
    );

    expect(
      upsertMock
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          key_windowStart: {
            key: "llm:user-1",
            windowStart:
              new Date(
                "2026-08-19T10:01:00.000Z"
              ),
          },
        },
      })
    );
  });

  it("keeps rate-limit keys isolated between users", async () => {
    upsertMock
      .mockResolvedValueOnce({
        count: 21,
      })
      .mockResolvedValueOnce({
        count: 1,
      });

    const user1 =
      await checkRateLimit(
        "llm:user-1"
      );

    const user2 =
      await checkRateLimit(
        "llm:user-2"
      );

    expect(user1.allowed).toBe(
      false
    );

    expect(user2.allowed).toBe(
      true
    );

    expect(
      upsertMock
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          key_windowStart:
            expect.objectContaining({
              key: "llm:user-1",
            }),
        },
      })
    );

    expect(
      upsertMock
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          key_windowStart:
            expect.objectContaining({
              key: "llm:user-2",
            }),
        },
      })
    );
  });

  it("never returns less than one second of retry-after", async () => {
    vi.setSystemTime(
      new Date(
        "2026-08-19T10:00:59.999Z"
      )
    );

    upsertMock.mockResolvedValue({
      count: 21,
    });

    const result =
      await checkRateLimit(
        "llm:user-1"
      );

    expect(
      result.retryAfterSeconds
    ).toBe(1);
  });
});

describe("checkDailyQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date(
        "2026-08-19T10:30:00.000Z"
      )
    );

    deleteManyMock.mockResolvedValue({
      count: 0,
    });
  });

  it("allows requests below the daily quota", async () => {
    upsertMock.mockResolvedValue({
      count: 1,
    });

    const result =
      await checkDailyQuota(
        "user-1"
      );

    expect(result).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("allows the 500th request", async () => {
    upsertMock.mockResolvedValue({
      count: 500,
    });

    const result =
      await checkDailyQuota(
        "user-1"
      );

    expect(result.allowed).toBe(
      true
    );
  });

  it("blocks the 501st request", async () => {
    upsertMock.mockResolvedValue({
      count: 501,
    });

    const result =
      await checkDailyQuota(
        "user-1"
      );

    expect(result.allowed).toBe(
      false
    );
  });

  it("uses the UTC calendar day as the bucket", async () => {
    upsertMock.mockResolvedValue({
      count: 1,
    });

    await checkDailyQuota(
      "user-1"
    );

    expect(
      upsertMock
    ).toHaveBeenCalledWith({
      where: {
        key_windowStart: {
          key:
            "llm-daily:user-1",
          windowStart:
            new Date(
              "2026-08-19T00:00:00.000Z"
            ),
        },
      },
      create: {
        key:
          "llm-daily:user-1",
        windowStart:
          new Date(
            "2026-08-19T00:00:00.000Z"
          ),
        count: 1,
      },
      update: {
        count: {
          increment: 1,
        },
      },
      select: {
        count: true,
      },
    });
  });

  it("returns retry-after until the next UTC day", async () => {
    upsertMock.mockResolvedValue({
      count: 501,
    });

    const result =
      await checkDailyQuota(
        "user-1"
      );

    expect(
      result.retryAfterSeconds
    ).toBe(
      13 * 60 * 60 +
        30 * 60
    );
  });

  it("starts a new bucket on the next UTC day", async () => {
    upsertMock.mockResolvedValue({
      count: 1,
    });

    await checkDailyQuota(
      "user-1"
    );

    vi.setSystemTime(
      new Date(
        "2026-08-20T00:00:01.000Z"
      )
    );

    await checkDailyQuota(
      "user-1"
    );

    expect(
      upsertMock
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          key_windowStart: {
            key:
              "llm-daily:user-1",
            windowStart:
              new Date(
                "2026-08-20T00:00:00.000Z"
              ),
          },
        },
      })
    );
  });
});

describe("rate-limit cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    deleteManyMock.mockResolvedValue({
      count: 0,
    });

    upsertMock.mockResolvedValue({
      count: 1,
    });
  });

  it("removes buckets older than the retention period", async () => {
    vi.setSystemTime(
      new Date(
        "2030-08-19T10:00:00.000Z"
      )
    );

    await checkRateLimit(
      "llm:user-cleanup"
    );

    expect(
      deleteManyMock
    ).toHaveBeenCalledWith({
      where: {
        windowStart: {
          lt: new Date(
            "2030-08-17T10:00:00.000Z"
          ),
        },
      },
    });
  });

  it("does not run cleanup again within one hour", async () => {
    vi.setSystemTime(
      new Date(
        "2031-08-19T10:00:00.000Z"
      )
    );

    await checkRateLimit(
      "llm:user-1"
    );

    await checkRateLimit(
      "llm:user-2"
    );

    expect(
      deleteManyMock
    ).toHaveBeenCalledTimes(1);
  });
});