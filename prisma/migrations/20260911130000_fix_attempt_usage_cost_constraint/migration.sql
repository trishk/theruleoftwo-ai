PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AiGenerationAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "generationId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "retryOfId" TEXT,
  "requesterId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "outputMessageId" INTEGER,
  "errorCode" TEXT,
  "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "providerInvokedAt" DATETIME,
  "progressAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "failedAt" DATETIME,
  "stoppedAt" DATETIME,
  "usageState" TEXT CHECK ("usageState" IS NULL OR "usageState" IN ('not_applicable', 'pending', 'captured', 'unavailable')),
  "costState" TEXT CHECK ("costState" IS NULL OR "costState" IN ('not_applicable', 'pending', 'estimated', 'unknown')),
  "providerSnapshot" TEXT,
  "requestedModel" TEXT,
  "effectiveModel" TEXT,
  "effectiveModelSource" TEXT CHECK ("effectiveModelSource" IS NULL OR "effectiveModelSource" IN ('provider', 'requested_fallback')),
  "inputTokens" BIGINT CHECK ("inputTokens" IS NULL OR "inputTokens" >= 0),
  "inputTokensNoCache" BIGINT CHECK ("inputTokensNoCache" IS NULL OR "inputTokensNoCache" >= 0),
  "inputTokensCacheRead" BIGINT CHECK ("inputTokensCacheRead" IS NULL OR "inputTokensCacheRead" >= 0),
  "inputTokensCacheWrite" BIGINT CHECK ("inputTokensCacheWrite" IS NULL OR "inputTokensCacheWrite" >= 0),
  "outputTokens" BIGINT CHECK ("outputTokens" IS NULL OR "outputTokens" >= 0),
  "outputTextTokens" BIGINT CHECK ("outputTextTokens" IS NULL OR "outputTextTokens" >= 0),
  "outputReasoningTokens" BIGINT CHECK ("outputReasoningTokens" IS NULL OR "outputReasoningTokens" >= 0),
  "totalTokens" BIGINT CHECK ("totalTokens" IS NULL OR "totalTokens" >= 0),
  "usageCapturedAt" DATETIME,
  "usageUnavailableReason" TEXT,
  "pricingVersion" TEXT,
  "pricingCurrency" TEXT,
  "inputRateNanoUsdPerToken" BIGINT CHECK ("inputRateNanoUsdPerToken" IS NULL OR "inputRateNanoUsdPerToken" >= 0),
  "cacheReadRateNanoUsdPerToken" BIGINT CHECK ("cacheReadRateNanoUsdPerToken" IS NULL OR "cacheReadRateNanoUsdPerToken" >= 0),
  "cacheWriteRateNanoUsdPerToken" BIGINT CHECK ("cacheWriteRateNanoUsdPerToken" IS NULL OR "cacheWriteRateNanoUsdPerToken" >= 0),
  "outputRateNanoUsdPerToken" BIGINT CHECK ("outputRateNanoUsdPerToken" IS NULL OR "outputRateNanoUsdPerToken" >= 0),
  "estimatedCostNanoUsd" BIGINT CHECK (
    "estimatedCostNanoUsd" IS NULL OR (
      "estimatedCostNanoUsd" >= 0
      AND "costState" IS 'estimated'
      AND "usageState" IS 'captured'
    )
  ),
  "costUnavailableReason" TEXT,
  CONSTRAINT "AiGenerationAttempt_terminal_timestamp_check" CHECK (
    (CASE WHEN "completedAt" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "failedAt" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "stoppedAt" IS NULL THEN 0 ELSE 1 END) <= 1
  ),
  CONSTRAINT "AiGenerationAttempt_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AiGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGenerationAttempt_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGenerationAttempt_outputMessageId_fkey" FOREIGN KEY ("outputMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiGenerationAttempt_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "new_AiGenerationAttempt" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

INSERT INTO "new_AiGenerationAttempt" SELECT * FROM "AiGenerationAttempt";
DROP TABLE "AiGenerationAttempt";
ALTER TABLE "new_AiGenerationAttempt" RENAME TO "AiGenerationAttempt";

CREATE UNIQUE INDEX "AiGenerationAttempt_retryOfId_key" ON "AiGenerationAttempt"("retryOfId");
CREATE UNIQUE INDEX "AiGenerationAttempt_outputMessageId_key" ON "AiGenerationAttempt"("outputMessageId");
CREATE UNIQUE INDEX "AiGenerationAttempt_generationId_attemptNumber_key" ON "AiGenerationAttempt"("generationId", "attemptNumber");
CREATE INDEX "AiGenerationAttempt_status_progressAt_idx" ON "AiGenerationAttempt"("status", "progressAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
