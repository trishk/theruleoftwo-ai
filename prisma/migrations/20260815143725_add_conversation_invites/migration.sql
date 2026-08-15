-- CreateTable
CREATE TABLE "ConversationInvite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ConversationInvite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationInvite_token_key" ON "ConversationInvite"("token");

-- CreateIndex
CREATE INDEX "ConversationInvite_conversationId_idx" ON "ConversationInvite"("conversationId");
