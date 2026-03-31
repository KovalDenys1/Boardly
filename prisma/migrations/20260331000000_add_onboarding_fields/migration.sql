-- AlterTable
ALTER TABLE "AccountPreferences" ADD COLUMN "onboardingCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN "onboardingSkippedAt" TIMESTAMPTZ(3);
