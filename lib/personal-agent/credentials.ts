import crypto from "node:crypto";

const SECRET_BYTES = 32;

export function hashCredential(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function randomSecret() {
  return crypto.randomBytes(SECRET_BYTES).toString("base64url");
}

export function createPairingCredential() {
  const id = crypto.randomUUID();
  const credential = `pair1.${id}.${randomSecret()}`;
  return { id, credential, hash: hashCredential(credential) };
}

export function createAgentCredential(agentId: string) {
  const credential = `pa1.${agentId}.${randomSecret()}`;
  return { credential, hash: hashCredential(credential) };
}

export function parseCredentialId(value: string, prefix: "pair1" | "pa1") {
  const match = value.match(
    new RegExp(`^${prefix}\\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.([A-Za-z0-9_-]{43})$`, "i")
  );
  return match?.[1] ?? null;
}

export function credentialHashesMatch(left: string, right: string) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length &&
    crypto.timingSafeEqual(leftBytes, rightBytes);
}
