CREATE TABLE "public"."UserPurchases" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "packId"          TEXT NOT NULL,
    "price"           INTEGER NOT NULL,
    "stripePaymentId" TEXT,
    "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPurchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPurchases_stripePaymentId_key" ON "public"."UserPurchases"("stripePaymentId");
CREATE UNIQUE INDEX "UserPurchases_userId_packId_key"   ON "public"."UserPurchases"("userId", "packId");
CREATE INDEX "UserPurchases_userId_idx"                 ON "public"."UserPurchases"("userId");

ALTER TABLE "public"."UserPurchases"
    ADD CONSTRAINT "UserPurchases_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
