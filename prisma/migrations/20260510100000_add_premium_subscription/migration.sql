-- Drop one-time purchase table (replaced by subscription model)
DROP TABLE IF EXISTS "UserPurchases";

-- Add subscription fields to Users
ALTER TABLE "Users"
  ADD COLUMN "stripeCustomerId" TEXT UNIQUE,
  ADD COLUMN "premiumUntil" TIMESTAMPTZ(3);
