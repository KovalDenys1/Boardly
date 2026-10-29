# Plan – Stripe 23 and API version endive
Skills: superpowers:test-driven-development for all code; superpowers:systematic-debugging for any replay that fails.

- [x] T1 (US-1) `npm ci` in the worktree, then `npm install stripe@^23` – the upgrade itself; read `node_modules/stripe` for the pinned version
- [x] T2 (US-1..3) Read the endive changelog in full and list every field the code reads that changed – the risk map for the rest
- [x] T3 (US-1) `lib/stripe.ts` on endive; fix the type errors `tsc` shows, each by the changelog, not by a cast
- [x] T4 (US-2) Route tests for cancel and reactivate, failing first where behaviour is missing, then green
- [x] T5 (US-3) Capture endive payloads for the six handled events with `stripe listen --latest` + `stripe trigger`; anonymise into fixtures; a unit test per event
- [x] T6 (US-1, US-2) End-to-end in test mode: checkout with a test card, then cancel and reactivate through the routes; evidence in `audit-evidence/` – the hosted Managed Payments page stops automated browsers at hCaptcha; see Deviations and Deferred
- [x] T7 (US-4) Remove the stripe ignore rule from `.github/dependabot.yml`
- [x] T8 Gates: `npm run ci:quick`, full `npm test` once; keep `migrations.md` true

## Implementation report – 2026-10-29 (round 1)
Worktree: /Users/denyskoval/Projects/.worktrees/boardly-1322 | Branch: feature/1322-stripe-23 @ c2ab2e5e (code; the features commit follows)

### Delivered
- US-1: `stripe` ^23.0.1 in `package.json` and the lockfile; `lib/stripe.ts` sends `Stripe.API_VERSION` (`2026-09-30.endive`) behind a `satisfies` check that fails the typecheck on a new major. No dahlia string left outside `features/` (`docs/DEPENDENCY_UPGRADE_PLAN.md` row and the `lib/premium-checkout-session.ts` comment updated). Live: `POST /api/stripe/checkout` answered 200 with a Checkout URL for a subscription session with `managed_payments.enabled: true`; a paid subscription checkout replayed at endive turned the test user Premium through the webhook (`premiumUntil` = `items.data[0].current_period_end`, consent row, confirmation sent); a nonexistent price answered 502 with today's body. Tests: `__tests__/lib/stripe-client.test.ts`.
- US-2: `__tests__/api/stripe-cancel-reactivate.test.ts` – success, no subscription, someone else's subscription in the request ignored or refused, signed out, Stripe updated before the row. Live on a real endive subscription: cancel → Stripe `cancel_at_period_end` true, row true after `customer.subscription.updated`; reactivate → false and false.
- US-3: all six handled types replayed at endive, plus the unpaid completion: 61 events forwarded, 61 answered 200, all `2026-09-30.endive` (`audit-evidence/replay-log.txt`). Fixtures in `__tests__/fixtures/stripe-endive/` (captured, anonymised); `__tests__/api/stripe-webhook-endive.test.ts` delivers each with a real stripe-node 23 signature and asserts the state change; a payload signed with another secret answers 400 before anything is claimed.
- US-4: the `stripe` ignore rule is gone from `.github/dependabot.yml`; `ci:quick` and the full suite are green.

### Deviations
- US-1 Verify: the hosted Managed Payments page was not completed. Headless Chrome filled 4242 and "Pay and subscribe" raised an hCaptcha challenge, so the session stayed open. The paid completion was replayed as a subscription Checkout Session without Managed Payments, using the same customer, price and consent metadata. Details are under Deviations in spec.md.

### Beyond spec
- `docs/DEPENDENCY_UPGRADE_PLAN.md` stripe row: it named `^22.1.1` and the dahlia version, against the "no stale dahlia string" criterion.
- A fixture test for the unpaid `checkout.session.completed` branch, captured in the same replay.

### Deferred / blocked
- One completion of a Managed Payments Checkout at endive in a person's browser. hCaptcha stops automated browsers, so the lead's auditor will hit it too. Who: Denys, only if the lead wants it before release. Steps: in the worktree, run `next dev --webpack -p 3015` with `STRIPE_WEBHOOK_SECRET` from `stripe listen --print-secret` and `stripe listen --latest --forward-to localhost:3015/api/stripe/webhook`, using the `.env.local` test key. Then buy Premium at http://localhost:3015/premium and pay with 4242 4242 4242 4242, 12/34, 123.
- Seen, not in scope: Stripe marks a SEPA subscription `active` while the first debit is processing, so `customer.subscription.created` grants Premium before the money arrives. That bypasses the unpaid-checkout rule from #1179. When the debit fails, the subscription goes `past_due` and Premium is revoked, but `premiumFirstGrantedAt` stays stamped (user C in the replay log). This is the same at dahlia. Today's Managed Payments sessions offer only `card` and `cashapp`, so no delayed method reaches it.

### Disputed
- None

### Verification
- `node_modules/stripe/cjs/apiVersion.js` → `ApiVersion = '2026-09-30.endive'` (stripe 23.0.1)
- `npx tsc --noEmit` → exit 0. A scratch `'2027-03-31.fig' satisfies \`${string}.endive\`` → TS1360, while `'2026-10-28.endive'` passes
- `npx jest` on the 11 Stripe suites (webhook, checkout, premium-checkout-session, checkout validation, subscription notices, account deletion, renewal, delete-account billing, premium plans, client, cancel/reactivate) → 118 passed
- `npx jest __tests__/api/stripe-webhook-endive.test.ts` → 16 passed. Pointing the route at the subscription-level `current_period_end` → 4 failed, file restored
- Live replay (`audit-evidence/replay-log.txt`) → 61 events, 61 × 200, 61 × `2026-09-30.endive`. A: Premium, then `cancel_at_period_end` true/true and false/false (Stripe/app), then revoked on deleted. B: pending, then Premium and confirmed on async success. C: consent row only, no confirmation, no Premium
- `POST /api/stripe/checkout` with `STRIPE_PREMIUM_PRICE_ID=price_does_not_exist_1322` → 502 `{"error":"Checkout is temporarily unavailable. Please try again in a few minutes."}`, logged `StripeInvalidRequestError resource_missing line_items[0][price]`
- Database: `.env.local` is boardly-dev (`inmvbxfflqeblynpktay`). The three test users, their consent rows, their 61 ledger rows and their three Stripe test customers were deleted afterwards. The dev server and the listener were stopped by PID
- `npm run ci:quick` → exit 0 (85 lint warnings, none in this branch's files)
- `npm test` → 543 suites, 5851 tests passed, exit 0
- red_green → exit 0, "proven – 1 of 3 changed test files fail without the change" (`stripe-client.test.ts` bites). The cancel/reactivate and endive-webhook tests cover route code this branch does not change, so they pass on base by design
- Live UI: none. No Boardly UI changed; the Stripe page is Stripe's
