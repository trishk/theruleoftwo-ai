import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { validateStreamRequest } from "@/lib/chat-stream/validate-stream-request";
import { streamValidationErrorResponse } from "@/lib/chat-stream/stream-validation-error";
import { completeAttempt, failAttempt, flushAttempt, getAttemptStatus, heartbeatAttempt, markProviderInvoked, persistAttemptTelemetry, recoverStaleGenerations, reserveGeneration, startAttempt } from "@/lib/chat-stream/generation-lifecycle";
import { getStreamErrorCode } from "@/lib/chat-stream/stream-errors";
import { prepareLLMRequest } from "@/lib/llm/prepare-request";
import { streamLLM } from "@/lib/llm/registry";
import { checkDailyQuota, checkRateLimit } from "@/lib/security/rate-limit";
import { acquireGenerationLease, releaseGenerationLease, renewGenerationLease } from "@/lib/security/generation-concurrency";
import type { LLMStreamEvent } from "@/lib/llm/types";
import { observeTelemetry } from "@/lib/llm/usage/capture";

const FLUSH_INTERVAL_MS = 1_000;
const FLUSH_SIZE_BYTES = 2 * 1024;
const STOP_POLL_MS = 3_000;
const HEARTBEAT_MS = 30_000;
const json = (payload: object, status: number) => Response.json(payload, { status });

export async function POST(request: NextRequest) {
  const user = await requireUser();
  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return new Response("Invalid request body.", { status: 400 }); }

  let validated;
  try { validated = await validateStreamRequest({ rawBody, userId: user.id }); }
  catch (error) { return streamValidationErrorResponse(error); }
  const body = rawBody as Record<string, unknown>;
  const retryOfAttemptId = body.retryOfAttemptId;
  if (retryOfAttemptId !== undefined && (typeof retryOfAttemptId !== "string" || !retryOfAttemptId)) {
    return json({ code: "invalid_retry_attempt" }, 400);
  }
  const { conversationId, messageId, provider, ownerId } = validated;
  await recoverStaleGenerations(messageId, provider);

  let reservation;
  try {
    reservation = await reserveGeneration({ conversationId, sourceMessageId: messageId, provider, requesterId: user.id, retryOfAttemptId: retryOfAttemptId as string | undefined });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "RETRY_NOT_FOUND") return json({ code: "retry_not_found" }, 404);
    if (code === "RETRY_NOT_ALLOWED") return json({ code: "retry_not_allowed" }, 409);
    throw error;
  }
  if (!reservation.created) {
    const payload = { outcome: reservation.status === "completed" ? "replayed" : "duplicate", status: reservation.status, generationId: reservation.generationId, attemptId: reservation.attemptId, outputMessageId: reservation.outputMessageId, ...(reservation.status === "completed" ? { output: reservation.output } : {}) };
    if (reservation.status === "pending" || reservation.status === "streaming") return json(payload, 202);
    if (reservation.status === "completed") return json(payload, 200);
    return json({ ...payload, code: "retry_required" }, 409);
  }

  const fail = async (code: string) => { await failAttempt(reservation.attemptId, code); };
  const rateLimit = await checkRateLimit(`llm:${user.id}`);
  if (!rateLimit.allowed) { await fail("rate_limited"); return Response.json({ code: "rate_limited", retryAfterSeconds: rateLimit.retryAfterSeconds, generationId: reservation.generationId, attemptId: reservation.attemptId }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }); }
  const lease = await acquireGenerationLease(ownerId);
  if (!lease) { await fail("concurrency_unavailable"); return Response.json({ code: "concurrency_unavailable", retryAfterSeconds: 5, generationId: reservation.generationId, attemptId: reservation.attemptId }, { status: 429, headers: { "Retry-After": "5" } }); }
  let leaseReleased = false;
  const releaseLease = async () => {
    if (leaseReleased) return;
    leaseReleased = true;
    try { await releaseGenerationLease(lease.token); } catch { console.error("Failed to release generation lease."); }
  };

  let llmRequest;
  try {
    llmRequest = await prepareLLMRequest({ conversationId, sourceMessageId: messageId, provider, currentUserId: user.id, currentUserName: user.name, ownerId });
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "Provider is not configured for this conversation.";
    await fail(unconfigured ? "provider_not_configured" : "request_preparation_failed");
    await releaseLease();
    if (unconfigured) return Response.json({ code: "provider_not_configured", generationId: reservation.generationId, attemptId: reservation.attemptId }, { status: 400, headers: { "X-Chat-Error-Code": "provider_not_configured" } });
    console.error("Failed to prepare LLM request.");
    return json({ code: "request_preparation_failed" }, 500);
  }
  const quota = await checkDailyQuota(ownerId);
  if (!quota.allowed) { await fail("quota_exceeded"); await releaseLease(); return Response.json({ code: "quota_exceeded", retryAfterSeconds: quota.retryAfterSeconds, generationId: reservation.generationId, attemptId: reservation.attemptId }, { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } }); }

  let outputMessageId: number;
  try { outputMessageId = await startAttempt({ attemptId: reservation.attemptId, conversationId, provider }); }
  catch { await fail("persistence_failed"); await releaseLease(); return json({ code: "persistence_failed" }, 500); }

  const providerController = new AbortController();
  const abortFromClient = () => providerController.abort();
  request.signal.addEventListener("abort", abortFromClient, { once: true });
  await markProviderInvoked(reservation.attemptId, { provider, requestedModel: llmRequest.model });
  let result;
  try { result = streamLLM(llmRequest, providerController.signal); }
  catch { await fail("provider_failed"); try { await persistAttemptTelemetry({ attemptId: reservation.attemptId, provider, requestedModel: llmRequest.model, capture: { unavailableReason: "provider_start_failed" } }); } catch { console.error("Failed to persist generation telemetry."); } await releaseLease(); return json({ code: "provider_failed" }, 500); }

  const settleTelemetry = observeTelemetry(result);
  const persistTelemetry = async () => {
    try { await persistAttemptTelemetry({ attemptId: reservation.attemptId, provider, requestedModel: llmRequest.model, capture: await settleTelemetry() }); }
    catch { console.error("Failed to persist generation telemetry."); }
  };

  const encoder = new TextEncoder();
  const encode = (event: LLMStreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let persistedText = "";
      let lastFlushAt = Date.now();
      let flushChain = Promise.resolve(true);
      let persistenceFailed = false;
      const queueFlush = (force = false) => {
        const snapshot = fullText;
        const newBytes = Buffer.byteLength(snapshot.slice(persistedText.length), "utf8");
        if (!force && Date.now() - lastFlushAt < FLUSH_INTERVAL_MS && newBytes < FLUSH_SIZE_BYTES) return flushChain;
        if (snapshot === persistedText) return flushChain;
        flushChain = flushChain.then(async () => {
          const saved = await flushAttempt(reservation.attemptId, snapshot);
          if (saved) { persistedText = snapshot; lastFlushAt = Date.now(); }
          return saved;
        }).catch((error) => { persistenceFailed = true; throw error; });
        return flushChain;
      };
      const stopTimer = setInterval(() => {
        void getAttemptStatus(reservation.attemptId).then((attempt) => { if (attempt?.status === "stopped") providerController.abort(); }).catch(() => undefined);
      }, STOP_POLL_MS);
      const heartbeatTimer = setInterval(() => {
        void getAttemptStatus(reservation.attemptId).then(async (attempt) => {
          if (attempt?.status === "stopped") { providerController.abort(); return; }
          if (attempt?.status !== "streaming" || !(await renewGenerationLease(lease.token))) { providerController.abort(); await fail("lease_lost"); return; }
          flushChain = flushChain.then(async () => heartbeatAttempt(reservation.attemptId));
          await flushChain;
        }).catch(() => providerController.abort());
      }, HEARTBEAT_MS);
      try {
        controller.enqueue(encode({ type: "generation", outcome: "started", generationId: reservation.generationId, attemptId: reservation.attemptId, messageId: outputMessageId }));
        for await (const delta of result.textStream) {
          fullText += delta;
          controller.enqueue(encode({ type: "delta", text: delta }));
          await queueFlush(false);
        }
        await queueFlush(true);
        await flushChain;
        if (!(await completeAttempt(reservation.attemptId))) throw new Error("ATTEMPT_TERMINALIZED");
        await persistTelemetry();
        controller.enqueue(encode({ type: "done" }));
        controller.close();
      } catch (error) {
        try { await queueFlush(true); await flushChain; } catch { /* preserve last committed snapshot */ }
        const current = await getAttemptStatus(reservation.attemptId);
        if (current?.status === "streaming") await fail(persistenceFailed ? "persistence_failed" : error instanceof Error && error.message === "ATTEMPT_TERMINALIZED" ? "generation_interrupted" : "provider_failed");
        await persistTelemetry();
        try { controller.enqueue(encode({ type: "error", code: getStreamErrorCode(error) })); controller.close(); } catch { /* disconnected */ }
      } finally {
        clearInterval(stopTimer);
        clearInterval(heartbeatTimer);
        request.signal.removeEventListener("abort", abortFromClient);
        await releaseLease();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
