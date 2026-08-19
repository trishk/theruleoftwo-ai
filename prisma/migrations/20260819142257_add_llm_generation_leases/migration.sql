-- CreateTable
CREATE TABLE "LLMGenerationLease" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "LLMGenerationLease_token_key" ON "LLMGenerationLease"("token");

-- CreateIndex
CREATE INDEX "LLMGenerationLease_expiresAt_idx" ON "LLMGenerationLease"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LLMGenerationLease_userId_slot_key" ON "LLMGenerationLease"("userId", "slot");
