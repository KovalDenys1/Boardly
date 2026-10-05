-- Which Terms version an account holder was last emailed about, and when (Terms section 11).
ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "termsNoticeVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "termsNoticeSentAt" TIMESTAMPTZ(3);
