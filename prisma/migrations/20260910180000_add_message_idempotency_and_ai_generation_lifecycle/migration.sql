-- Add nullable human-message idempotency metadata. Existing messages remain NULL.
ALTER TABLE "Message" ADD COLUMN "clientMessageId" TEXT;
ALTER TABLE "Message" ADD COLUMN "clientPayloadHash" TEXT;

CREATE UNIQUE INDEX "Message_conversationId_authorId_clientMessageId_key"
ON "Message"("conversationId", "authorId", "clientMessageId");

CREATE TABLE "AiGeneration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL,
  "sourceMessageId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "initialRequesterId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AiGeneration_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_initialRequesterId_fkey" FOREIGN KEY ("initialRequesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiGenerationAttempt" (
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
  CONSTRAINT "AiGenerationAttempt_terminal_timestamp_check" CHECK (
    (CASE WHEN "completedAt" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "failedAt" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "stoppedAt" IS NULL THEN 0 ELSE 1 END) <= 1
  ),
  CONSTRAINT "AiGenerationAttempt_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AiGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGenerationAttempt_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGenerationAttempt_outputMessageId_fkey" FOREIGN KEY ("outputMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiGenerationAttempt_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "AiGenerationAttempt" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiGeneration_sourceMessageId_provider_key" ON "AiGeneration"("sourceMessageId", "provider");
CREATE INDEX "AiGeneration_conversationId_idx" ON "AiGeneration"("conversationId");
CREATE UNIQUE INDEX "AiGenerationAttempt_retryOfId_key" ON "AiGenerationAttempt"("retryOfId");
CREATE UNIQUE INDEX "AiGenerationAttempt_outputMessageId_key" ON "AiGenerationAttempt"("outputMessageId");
CREATE UNIQUE INDEX "AiGenerationAttempt_generationId_attemptNumber_key" ON "AiGenerationAttempt"("generationId", "attemptNumber");
CREATE INDEX "AiGenerationAttempt_status_progressAt_idx" ON "AiGenerationAttempt"("status", "progressAt");
