-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('public', 'friends', 'private');

-- CreateTable
CREATE TABLE "AccountPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPreferences_userId_key" ON "AccountPreferences"("userId");

-- CreateIndex
CREATE INDEX "AccountPreferences_userId_idx" ON "AccountPreferences"("userId");

-- CreateIndex
CREATE INDEX "AccountPreferences_profileVisibility_idx" ON "AccountPreferences"("profileVisibility");

-- AddForeignKey
ALTER TABLE "AccountPreferences" ADD CONSTRAINT "AccountPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
