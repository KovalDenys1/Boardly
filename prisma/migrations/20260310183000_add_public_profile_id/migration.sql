ALTER TABLE "Users"
ADD COLUMN "publicProfileId" TEXT;

CREATE UNIQUE INDEX "Users_publicProfileId_key" ON "Users"("publicProfileId");
