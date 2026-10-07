-- The site locale an account holder uses, so every mail is written in that language (#1331).
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "language" TEXT;
