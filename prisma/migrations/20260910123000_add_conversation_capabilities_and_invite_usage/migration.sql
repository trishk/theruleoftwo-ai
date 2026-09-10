-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "allowMemberAiUsage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ConversationInvite" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
