ALTER TABLE "Users"
  ADD COLUMN "stripeSubscriptionId" TEXT UNIQUE,
  ADD COLUMN "premiumCancelAtPeriod" BOOLEAN NOT NULL DEFAULT false;
