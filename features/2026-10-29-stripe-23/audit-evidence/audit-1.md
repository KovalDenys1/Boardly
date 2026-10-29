# Audit 1 – evidence
Stripe 23 and API version endive (#1322) · 2026-10-29 · fresh auditor session

Checkout: `feature/1322-stripe-23` @ 4aba1e4a (code @ c2ab2e5e), base `origin/develop`, merge base 97c1854a. Worktree `/Users/denyskoval/Projects/.worktrees/boardly-1322` with its own `node_modules` and `prisma/generated`.

## Set-up
- App: http://localhost:3015 – `nice -n 10 next dev --webpack -p 3015` from the worktree (PID 87747, Next 16.4.2, ready 15:04:56).
- Listener: `stripe listen --latest --format JSON --forward-to localhost:3015/api/stripe/webhook` (PID 87746), key from `.env.local` through `STRIPE_API_KEY`, never printed. Its signing secret reached the dev server as `STRIPE_WEBHOOK_SECRET` through a 0600 scratch file deleted at stop.
- Guards: the runner refuses a key that is not `sk_test_` and a `DATABASE_URL` that is not boardly-dev (`inmvbxfflqeblynpktay`). Sandbox "Boardly sandbox", test mode only.
- Run-only overrides: `STRIPE_PREMIUM_PRICE_ID_YEARLY=price_does_not_exist_audit1322` (the refused-checkout row) and `NEXTAUTH_URL=http://localhost:3015`.
- Seed: four users tagged with run id `audit1322_mvtm8q16`, addresses `delivered+…@resend.dev` (Resend's sink), session cookies minted with `next-auth/jwt` `encode` in the app's own format. The checkout route created each Stripe test customer itself.
- Roles: A – card subscriber (checkout, paid completion, cancel, reactivate, toggles, deletion). B – SEPA debit that succeeds. C – SEPA debit that fails. D – no subscription (bad price, missing consent, someone else's subscription, signed out).
- Tool: `audit-evidence/live-matrix.sh` – HTTP against the routes, stripe-node 23.0.1 for Stripe reads and test-mode set-up, Prisma for the rows. No browser, because the spec sets Live UI to none. Viewports N/A.
- Re-run: `bash features/2026-10-29-stripe-23/audit-evidence/live-matrix.sh serve` in one shell; `phase setup`, `phase run`, `phase cleanup` in another; then `touch "$WORK/stop"` and `phase ledger`.

## Gates
| Check | Command | Printed |
|---|---|---|
| Stripe suites | jest in band on 14 suites: cancel-reactivate, checkout, webhook-endive, webhook, purchases renewal, delete-account billing, account deletion, premium-checkout-session, premium plans, checkout validation, client, subscription notice, the two premium mails | 14 suites, 157 passed, exit 0 |
| ci:quick | `npm run ci:quick` | exit 0; 85 lint warnings, none in the branch's files; typecheck clean; docs audit passed |
| Full suite | `npm test` | 543 suites, 5851 tests passed, 68 s, exit 0 |
| red_green | `python3 ~/Projects/second-brain/tools/red_green.py <worktree> --base origin/develop` | `bites stripe-client.test.ts`, `no bite` cancel-reactivate and webhook-endive, "proven – 1 of 3 changed test files fail without the change", exit 0. The untracked `.build/` (SwiftPM cache from 14:23, not this feature) gave exit 2, so it was parked for the run and restored |
| Pinned version | `node_modules/stripe/cjs/apiVersion.js`; `package.json`; lockfile | `2026-09-30.endive`; `^23.0.1`; 23.0.1 |
| Stale strings | `git grep -n dahlia -- . ':(exclude)features'` | nothing |
| Dependabot | `grep -i stripe .github/dependabot.yml` | nothing |
| Type guard | scratch `tsc` on `` '2027-03-31.fig' satisfies `${string}.endive` `` and on `'2026-10-28.endive'` | TS1360 for fig; nothing for the endive minor |

## Live matrix (scripted, 24 rows)
Observed is the runner's own line for each row. The `api` values in US2/US3 rows are the events fetched back through `GET /v1/events/:id`, which renders at the sandbox default (dahlia). The payloads the route handled were forwarded at endive (Listener below).

| Row | Area | Hypothesis | Setup | Invariant | Observed | Result |
|---|---|---|---|---|---|---|
| US1-checkout | US-1 | POST /api/stripe/checkout opens a subscription session with Managed Payments at endive | A | 200 + checkout.stripe.com URL; mode subscription, managed_payments.enabled, metadata.userId = caller | 200; session mode=subscription managed_payments={"enabled":true} status=open, userId match | PASS |
| US1-checkout-b | US-1 | checkout as B creates the customer and a session | B | 200 + URL, stripeCustomerId stored | 200; customer stored | PASS |
| US1-checkout-c | US-1 | checkout as C creates the customer and a session | C | 200 + URL, stripeCustomerId stored | 200; customer stored | PASS |
| US1-refused | US-1 | a checkout Stripe refuses (bad price) answers today's error shape | D, yearly plan | 502 {"error":"Checkout is temporarily unavailable. Please try again in a few minutes."} | 502, that body | PASS |
| US1-refused-nosession | US-1 | the refused checkout leaves no session behind | D | no session on D's customer | 0 sessions | PASS |
| US1-noconsent | US-1 | checkout without the consent body is refused before Stripe | D | 400 consent_required | 400 consent_required | PASS |
| US1-paid | US-1 | a paid subscription checkout at endive turns the user Premium through the webhook | A, `tok_visa` | premiumUntil = items.data[0].current_period_end; subscription stored; consent row confirmed; first grant stamped | premiumUntil 2026-11-29T14:06:19Z = item cpe; stored; consent monthly, confirmationSentAt 14:06:24Z; first grant stamped | PASS |
| US3-fields | US-3 | every Subscription field the code reads exists at endive | A's subscription | all present with expected types | 13 of 13 present; no top-level current_period_end | PASS |
| US1-pricing | US-1 | /premium pricing (prices.retrieve) resolves at endive | – | monthly price from Stripe | monthly $2.99 usd; yearly null (override) | PASS |
| US1-renewal | US-1 | the profile renewal line answers at endive | A | 200, plan monthly with a price | 200 {"renewal":{"plan":"monthly","price":"$2.99"}} | PASS |
| US1-portal | US-1 | a Premium user asking for checkout gets the billing portal | A | 200 + billing.stripe.com URL | 200, portal URL | PASS |
| US2-other | US-2 | naming someone else's subscription does not reach it | D names A's | 400 for D; A unchanged in Stripe | 400 No active subscription found; A cancel_at_period_end false | PASS |
| US2-cancel | US-2 | cancel sets cancel_at_period_end true in Stripe and the app, before and after the webhook | A | Stripe = route write = webhook result; premiumUntil kept | 200; Stripe true; row true after route and after the processed update; premiumUntil kept | PASS |
| US2-reactivate | US-2 | reactivate sets it false in Stripe and the app, before and after the webhook | A | same | 200; Stripe false; row false after route and webhook; premiumUntil kept | PASS |
| US2-toggle | US-2 | four writes back to back end with the row matching Stripe | A | row = Stripe once every update is processed | 200 ×4; 6 events processed; Stripe false, row false | PASS |
| US3-duplicate | US-3 | a redelivered event is claimed once | A's update event | 200 {received, duplicate:true}; row unchanged | 200 {"received":true,"duplicate":true}; unchanged | PASS |
| US3-signature | US-3 | wrong secret, unsigned, 600 s old or altered payloads are refused | synthetic | 400 each, nothing claimed | 400 Invalid signature; 400 Missing signature; 400; 400 | PASS |
| US3-unhandled | US-3 | an unhandled type is acknowledged and claimed | synthetic | 200, ledger row | 200 {"received":true} | PASS |
| US3-deleted | US-3 | customer.subscription.deleted revokes Premium | A | premiumUntil null, subscription null, flag false, first grant kept | as stated | PASS |
| US2-none-after-delete | US-2 | with the subscription gone, cancel and reactivate answer 400 | A | 400 / 400 | cancel 400 No active subscription found; reactivate 400 No subscription found | PASS |
| US2-negative | US-2 | no subscription, signed out and a missing Origin are refused | D, signed out | 400 / 400 / 401 / 403 | 400, 400, 401; missing Origin 400 | FAIL – probe expectation, see below |
| US3-async-succeeded | US-3 | completed-unpaid records consent only; async success grants and confirms | B, SEPA | consent row first, then premiumUntil and confirmationSentAt | set-up at endive with allowed_payment_method_types; unpaid completion; then premiumUntil 2026-11-29T14:06:40Z, confirmationSentAt 14:07:06Z | PASS |
| US3-async-failed | US-3 | async failure sends nothing and past_due leaves no Premium | C, SEPA | confirmationSentAt null; premiumUntil null after past_due | premiumUntil null, confirmationSentAt null, first grant stamped (Follow-up) | PASS |
| cleanup-deletion | Cleanup | account deletion cancels and deletes at endive | A–D | every test user deleted | sessions expired; A, D deleted; B, C deleted with cancelledSubscription true | PASS |

US2-negative, root cause: `lib/csrf.ts:148-151` lets a request with no Origin through when `NODE_ENV` is `development` and refuses it otherwise, so a dev server answers the route's own 400. The probe expected 403. Re-probed with curl and `Origin: https://evil.example` → 403. Code unchanged by this branch.

## Manual rows
| Row | Hypothesis | Observed | Result |
|---|---|---|---|
| CSRF cross-origin | a cross-origin write is refused | curl POST with `Origin: https://evil.example` → 403 | PASS |
| MP hosted completion | a Managed Payments Checkout paid with 4242 turns the user Premium at endive | Playwright MCP `browser_navigate` → "Browser is already in use … use --isolated" (another session held it). The implementer's headless run reached "Pay and subscribe"; their screenshot `hosted-checkout-after-pay.png` shows the filled page, and the hCaptcha request is from their network log | BLOCKED |
| MP server-side completion | the CLI can complete an MP session without a browser | `stripe trigger checkout.session.completed --api-version 2026-09-30.endive --raw <MP session on a probe customer → GET payment_pages → confirm>` → 400 `checkout_connect_mismatched_key` at the payment page. Session expired, probe customer deleted | BLOCKED |
| MP history | an MP completion already in the sandbox can be read at endive | `checkout.sessions.list({status:'complete'})` → 6 complete, 0 with Managed Payments | BLOCKED – nothing to read |
| MP at endive | endive changes something Managed Payments sessions carry | docs.stripe.com/changelog/endive (1.16 MB; `billing_cycle_anchor` 31×, `failed_tax_calculation` 2×) → 0 mentions of Managed Payments, `managed_payments` or merchant of record. `grep -n managed app/api/stripe/webhook/route.ts lib/subscription-notice.ts` → nothing | PASS – no MP delta at endive, no MP branch in the handler |

## Listener
70 events forwarded between 15:05:45 and 15:08, 70 × `[200]`, 70 × `"api_version":"2026-09-30.endive"`. Handled types among them: customer.subscription.created 3, updated 7, deleted 3, checkout.session.completed 3, async_payment_succeeded 1, async_payment_failed 1. The other 52 (customer, invoice, payment_intent, charge, mandate, payment_method, checkout.session.expired, billing_portal.session.created, invoice_payment.paid) were acknowledged with 200.

## Mutation probes
A throwaway detached worktree at HEAD, one substitution at a time, removed after. Baseline: webhook-endive 16, webhook 31, cancel-reactivate 10 passed.

| Mutant | Change | webhook-endive (16) | webhook (31) | cancel-reactivate (10) |
|---|---|---|---|---|
| M1 | period end read from the subscription, not `items.data[0]` | 4 failed | 5 failed | – |
| M2 | unpaid completion treated as paid | 1 failed | 1 failed | – |
| M3 | cancel flag dropped on update | 1 failed | 0 failed | – |
| M4 | signature unchecked | 1 failed | 28 failed | – |
| M5 | `currency_conversion` ignored (`route.ts:361`) | **0 failed** | 1 failed | – |
| M6 | async failure grants Premium | 1 failed | 1 failed | – |
| M7 | cancel trusts a subscription id from the body | – | – | 1 failed |
| M8 | cancel skips the row write | – | – | 2 failed |

M5 survives the endive file because its fixtures carry `currency_fixture0001` where Stripe sent `currency_conversion` (F-1).

## Clean-up
- Dev server 87747 and listener 87746 stopped by PID (`STOPPED dev=87747 listen=87746`); nothing listens on 3015 and no `stripe listen` runs.
- Users A–D deleted through `deleteUserAccount` at endive; 0 users and 0 consent rows left for the run id; 4 Stripe test customers deleted (`customer.deleted` ×4); 3 `checkout_started` rows deleted by id (cmvtm8u6w0000plv7lt5knluh, cmvtm8vr30001plv7f5mf5ynn, cmvtm8wy80002plv7a2gcwvv4); 71 `StripeWebhookEvents` rows, synthetic ones included, deleted by id.
- Read back after clean-up: boardly-dev holds 0 users with a resend-sink address (both runs); the sandbox holds 0 customers with a resend.dev address; the 6 subscriptions created today are all canceled.
- `next dev` printed "Generated AGENTS.md for AI agents" and rewrote the generated heading in `AGENTS.md` at 15:04:58; restored with `git checkout -- AGENTS.md`.
- Scratch logs stay in the session scratchpad (`…/scratchpad/audit1322/`: rows.jsonl, listen.log with the secret redacted, dev.log, mutations.log, jest, ci-quick, npm-test and red_green logs). The state file with minted cookies was deleted.

## Evidence paths
- `audit-evidence/audit-1.md` – this file
- `audit-evidence/live-matrix.sh` – the runnable live matrix (embeds `live-matrix.ts`)
- `audit-evidence/replay-log.txt`, `audit-evidence/hosted-checkout-after-pay.png` – the implementer's, read not rerun
