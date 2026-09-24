-- ============================================================================
-- Migration: PurchaseConsents
-- Date: 2026-09-24
-- Description:
--   The record of a Premium sale (#1164, #1162). angrerettloven section 18
--   wants a confirmation on a durable medium that repeats the section 8
--   information and states that the buyer asked for the service to start
--   before the withdrawal period ended; ehandelsloven section 12 wants an
--   order confirmation. Checkout (#1162) puts the consent on the Stripe
--   Checkout Session's metadata; the webhook copies it here when the session
--   completes, one row per session, and sends the confirmation email once.
--
--   confirmationSentAt is the once-only claim for that email: NULL until a
--   run claims the send, reset to NULL when the send fails. The unique index
--   on checkoutSessionId is what makes a redelivered event an upsert rather
--   than a second row.
--
--   Read and written only by the server through Prisma, so it takes the same
--   shape as every other server-only table: RLS on, service_role only. No
--   GRANT or REVOKE is needed: since 20260924141000 the default privileges
--   for anon and authenticated are revoked in schema public, so a new table
--   gets no API-role grant to take away.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PurchaseConsents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "plan" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "withdrawalInfoVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "consentReceivedAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmationSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseConsents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseConsents_checkoutSessionId_key" ON "PurchaseConsents"("checkoutSessionId");
CREATE INDEX IF NOT EXISTS "PurchaseConsents_userId_idx" ON "PurchaseConsents"("userId");

ALTER TABLE "PurchaseConsents" ADD CONSTRAINT "PurchaseConsents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  service_clause TEXT;
BEGIN
  service_clause := CASE WHEN has_service_role THEN 'TO service_role' ELSE '' END;

  EXECUTE 'ALTER TABLE public."PurchaseConsents" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role can manage purchase consents" ON public."PurchaseConsents"';
  EXECUTE format(
    'CREATE POLICY "Service role can manage purchase consents"
       ON public."PurchaseConsents" FOR ALL
       %s
       USING ((SELECT public.is_service_role()))
       WITH CHECK ((SELECT public.is_service_role()))',
    service_clause
  );
END
$$;
