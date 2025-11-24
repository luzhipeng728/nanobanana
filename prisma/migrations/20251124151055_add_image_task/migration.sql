-- CreateTable
CREATE TABLE "ImageTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "config" TEXT,
    "referenceImages" TEXT,
    "imageUrl" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);
