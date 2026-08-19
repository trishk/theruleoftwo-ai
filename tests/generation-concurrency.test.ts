import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  createMock,
  deleteManyMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    lLMGenerationLease: {
      create: createMock,
      deleteMany: deleteManyMock,
    },
  },
}));

vi.mock("crypto", () => ({
  default: {
    randomUUID: vi
      .fn()
      .mockReturnValue(
        "test-lease-token"
      ),
  },
}));

import {
  acquireGenerationLease,
  releaseGenerationLease,
} from "@/lib/security/generation-concurrency";

function uniqueConstraintError() {
  return {
    code: "P2002",
  };
}

describe(
  "generation concurrency",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();

      vi.setSystemTime(
        new Date(
          "2026-08-19T10:00:00.000Z"
        )
      );

      deleteManyMock.mockResolvedValue({
        count: 0,
      });
    });

    it(
      "acquires the first available slot",
      async () => {
        createMock.mockResolvedValue({
          id: 1,
        });

        const result =
          await acquireGenerationLease(
            "user-1"
          );

        expect(result).toEqual({
          token:
            "test-lease-token",
          slot: 1,
        });

        expect(
          createMock
        ).toHaveBeenCalledWith({
          data: {
            userId: "user-1",
            slot: 1,
            token:
              "test-lease-token",
            expiresAt:
              new Date(
                "2026-08-19T10:05:00.000Z"
              ),
          },
        });
      }
    );

    it(
      "uses the second slot when the first is occupied",
      async () => {
        createMock
          .mockRejectedValueOnce(
            uniqueConstraintError()
          )
          .mockResolvedValueOnce({
            id: 2,
          });

        const result =
          await acquireGenerationLease(
            "user-1"
          );

        expect(result?.slot).toBe(
          2
        );

        expect(
          createMock
        ).toHaveBeenCalledTimes(
          2
        );

        expect(
          createMock
        ).toHaveBeenLastCalledWith({
          data: expect.objectContaining({
            userId: "user-1",
            slot: 2,
          }),
        });
      }
    );

    it(
      "uses the third slot when the first two are occupied",
      async () => {
        createMock
          .mockRejectedValueOnce(
            uniqueConstraintError()
          )
          .mockRejectedValueOnce(
            uniqueConstraintError()
          )
          .mockResolvedValueOnce({
            id: 3,
          });

        const result =
          await acquireGenerationLease(
            "user-1"
          );

        expect(result?.slot).toBe(
          3
        );

        expect(
          createMock
        ).toHaveBeenCalledTimes(
          3
        );
      }
    );

    it(
      "rejects generation when all three slots are occupied",
      async () => {
        createMock.mockRejectedValue(
          uniqueConstraintError()
        );

        const result =
          await acquireGenerationLease(
            "user-1"
          );

        expect(result).toBeNull();

        expect(
          createMock
        ).toHaveBeenCalledTimes(
          3
        );
      }
    );

    it(
      "removes expired leases before acquiring a slot",
      async () => {
        createMock.mockResolvedValue({
          id: 1,
        });

        await acquireGenerationLease(
          "user-1"
        );

        expect(
          deleteManyMock
        ).toHaveBeenCalledWith({
          where: {
            expiresAt: {
              lte: new Date(
                "2026-08-19T10:00:00.000Z"
              ),
            },
          },
        });
      }
    );

    it(
      "rethrows unexpected database errors",
      async () => {
        const databaseError =
          new Error(
            "database unavailable"
          );

        createMock.mockRejectedValue(
          databaseError
        );

        await expect(
          acquireGenerationLease(
            "user-1"
          )
        ).rejects.toThrow(
          "database unavailable"
        );

        expect(
          createMock
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    it(
      "releases only the lease matching the token",
      async () => {
        deleteManyMock.mockResolvedValue({
          count: 1,
        });

        await releaseGenerationLease(
          "lease-123"
        );

        expect(
          deleteManyMock
        ).toHaveBeenCalledWith({
          where: {
            token: "lease-123",
          },
        });
      }
    );
  }
);