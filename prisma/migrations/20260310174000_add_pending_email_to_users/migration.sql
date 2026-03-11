ALTER TABLE "Users"
ADD COLUMN "pendingEmail" TEXT;

CREATE UNIQUE INDEX "Users_pendingEmail_key" ON "Users"("pendingEmail");
