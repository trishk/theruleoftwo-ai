ALTER TABLE "AiGenerationAttempt" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'api' CHECK ("executionMode" IN ('api', 'personal'));
ALTER TABLE "AiGenerationAttempt" ADD COLUMN "personalState" TEXT CHECK ("personalState" IS NULL OR "personalState" IN ('queued', 'accepted', 'submitted_to_provider', 'completed', 'failed', 'ambiguous'));
ALTER TABLE "AiGenerationAttempt" ADD COLUMN "personalPrompt" TEXT;
ALTER TABLE "AiGenerationAttempt" ADD COLUMN "personalAgentId" TEXT REFERENCES "PersonalAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiGenerationAttempt" ADD COLUMN "personalAcceptedAt" DATETIME;
ALTER TABLE "AiGenerationAttempt" ADD COLUMN "personalSubmittedAt" DATETIME;
ALTER TABLE "AiGenerationAttempt" ADD COLUMN "personalAmbiguousAt" DATETIME;

CREATE INDEX "AiGenerationAttempt_personal_queue_idx" ON "AiGenerationAttempt"("executionMode", "personalState", "reservedAt");
CREATE INDEX "AiGenerationAttempt_personalAgentId_personalState_idx" ON "AiGenerationAttempt"("personalAgentId", "personalState");
CREATE UNIQUE INDEX "AiGenerationAttempt_personal_agent_active_key" ON "AiGenerationAttempt"("personalAgentId")
  WHERE "personalAgentId" IS NOT NULL AND "personalState" IN ('queued', 'accepted', 'submitted_to_provider');
