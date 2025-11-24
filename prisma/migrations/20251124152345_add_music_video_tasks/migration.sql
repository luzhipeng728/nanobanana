-- CreateTable
CREATE TABLE "MusicTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "lyrics" TEXT,
    "numberOfSongs" INTEGER NOT NULL DEFAULT 2,
    "externalTaskId" TEXT,
    "musicUrls" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "VideoTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "inputImage" TEXT,
    "videoUrl" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);
