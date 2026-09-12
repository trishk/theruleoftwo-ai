import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function createHealthResponse(
  checkDatabase: () => Promise<unknown> = () =>
    prisma.$queryRawUnsafe("SELECT 1")
) {
  try {
    await checkDatabase();
    return Response.json({ status: "ok" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

export async function GET() {
  return createHealthResponse();
}
