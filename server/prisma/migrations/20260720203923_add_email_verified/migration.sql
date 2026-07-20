-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationRequested" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "expoPushToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Business" ("avatarUrl", "bio", "category", "coverUrl", "createdAt", "email", "expoPushToken", "handle", "id", "name", "passwordHash", "verificationRequested", "verified") SELECT "avatarUrl", "bio", "category", "coverUrl", "createdAt", "email", "expoPushToken", "handle", "id", "name", "passwordHash", "verificationRequested", "verified" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_email_key" ON "Business"("email");
CREATE UNIQUE INDEX "Business_handle_key" ON "Business"("handle");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
