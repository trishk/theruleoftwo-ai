ALTER TABLE "UserIntegration" ADD COLUMN "connectionMode" TEXT NOT NULL DEFAULT 'api'
  CHECK ("connectionMode" IN ('api', 'personal'));

CREATE TABLE "PersonalAgent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "adapterStatus" TEXT CHECK (
    "adapterStatus" IS NULL OR
    "adapterStatus" IN ('ready', 'chrome_unavailable', 'sign_in_required', 'gemini_unavailable')
  ),
  "adapterStatusAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pairedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME,
  "revokedAt" DATETIME,
  CONSTRAINT "PersonalAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonalAgent_userId_key" ON "PersonalAgent"("userId");
CREATE UNIQUE INDEX "PersonalAgent_credentialHash_key" ON "PersonalAgent"("credentialHash");

CREATE TABLE "PersonalAgentPairingToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "redeemedAt" DATETIME,
  CONSTRAINT "PersonalAgentPairingToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonalAgentPairingToken_userId_key" ON "PersonalAgentPairingToken"("userId");
CREATE UNIQUE INDEX "PersonalAgentPairingToken_tokenHash_key" ON "PersonalAgentPairingToken"("tokenHash");
CREATE INDEX "PersonalAgentPairingToken_expiresAt_idx" ON "PersonalAgentPairingToken"("expiresAt");

CREATE TABLE "ProviderConversation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "conversationId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "remoteConversationId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProviderConversation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderConversation_conversationId_provider_key"
ON "ProviderConversation"("conversationId", "provider");
