-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserIntegration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "selectedModel" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "keyIv" TEXT,
    "keyAuthTag" TEXT,
    "storageMode" TEXT NOT NULL DEFAULT 'persistent',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserIntegration" ("createdAt", "id", "provider", "selectedModel", "updatedAt", "userId") SELECT "createdAt", "id", "provider", "selectedModel", "updatedAt", "userId" FROM "UserIntegration";
DROP TABLE "UserIntegration";
ALTER TABLE "new_UserIntegration" RENAME TO "UserIntegration";
CREATE UNIQUE INDEX "UserIntegration_userId_provider_key" ON "UserIntegration"("userId", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
