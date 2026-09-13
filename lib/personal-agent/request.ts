export const PERSONAL_AGENT_MAX_BODY_BYTES = 4 * 1024;

export async function readLimitedJson(
  request: Request,
  maxBytes = PERSONAL_AGENT_MAX_BODY_BYTES
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxBytes) {
      throw new Error("request_too_large");
    }
  }

  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
}
