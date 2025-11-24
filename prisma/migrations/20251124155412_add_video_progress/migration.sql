-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VideoTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "inputImage" TEXT,
    "videoUrl" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);
INSERT INTO "new_VideoTask" ("completedAt", "createdAt", "error", "id", "inputImage", "orientation", "prompt", "status", "updatedAt", "videoUrl") SELECT "completedAt", "createdAt", "error", "id", "inputImage", "orientation", "prompt", "status", "updatedAt", "videoUrl" FROM "VideoTask";
DROP TABLE "VideoTask";
ALTER TABLE "new_VideoTask" RENAME TO "VideoTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
