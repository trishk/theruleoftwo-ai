import { checkRateLimit } from "@/lib/security/rate-limit";
import { parseCredentialId } from "@/lib/personal-agent/credentials";
import { redeemPairingToken } from "@/lib/personal-agent/pairing";
import { readLimitedJson } from "@/lib/personal-agent/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readLimitedJson(request);
  } catch (error) {
    const status = error instanceof Error && error.message === "request_too_large" ? 413 : 400;
    return Response.json({ code: status === 413 ? "request_too_large" : "invalid_request" }, { status });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as Record<string, unknown>).pairingToken !== "string") {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }
  const pairingToken = (body as { pairingToken: string }).pairingToken;
  const tokenId = parseCredentialId(pairingToken, "pair1") ?? "invalid";
  const rateLimit = await checkRateLimit(`personal-agent-pair:${tokenId}`);
  if (!rateLimit.allowed) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }
  const result = await redeemPairingToken(pairingToken);
  if (!result) {
    return Response.json({ code: "invalid_pairing_token" }, { status: 401 });
  }
  return Response.json({
    protocolVersion: 1,
    agentId: result.agentId,
    agentCredential: result.agentCredential,
  }, { headers: { "Cache-Control": "no-store" } });
}
