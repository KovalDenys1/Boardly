# Stripe 23 and API version endive
Status: done | Class: personal | Repo: ~/Projects/boardly | Worktree: /Users/denyskoval/Projects/.worktrees/boardly-1322 | Branch: feature/1322-stripe-23 | Base: origin/develop | Created: 2026-10-29 | Updated: 2026-10-29

## Purpose
Premium keeps taking, cancelling and renewing subscriptions without a hitch while Boardly moves to the current Stripe library (stripe-node 23) and API version `2026-09-30.endive`, so dependency updates stop being held back and the payment code runs on a supported version.

## Context
Ticket #1322 (`gh issue view 1322 -R KovalDenys1/Boardly`). `lib/stripe.ts` builds the one client with `apiVersion: '2026-04-22.dahlia'` on `stripe@^22.1.1`; stripe-node 23 pins `2026-09-30.endive` and its types no longer accept the dahlia string. Checkout uses Stripe Managed Payments (`managed_payments: { enabled: true }` in `lib/premium-checkout-session.ts`). The webhook (`app/api/stripe/webhook/route.ts`) handles `customer.subscription.created|updated|deleted`, `checkout.session.completed`, `checkout.session.async_payment_succeeded|failed`, and reads `subscription.items.data[0].current_period_end` (also in `lib/subscription-notice.ts`). Every existing Stripe test mocks the client, so none proves a real API version. endive changelog: https://docs.stripe.com/changelog/endive – the ticket names `billing_cycle_anchor` and `failed_tax_calculation` as the two near this code; read the whole changelog for every field the code reads.

A test-mode key works: `STRIPE_SECRET_KEY` in `.env.local` (sandbox "Boardly sandbox"). The Stripe CLI's own login expired 2026-08-09 – pass the key with `--api-key` / `STRIPE_API_KEY` from `.env.local` (never print it).

## User stories

### US-1: Checkout works on endive
As a signed-in player, I can buy Premium so that the subscription starts and my account turns Premium.

Acceptance:
- [ ] `stripe` is `^23` in `package.json` and the lockfile; `lib/stripe.ts` uses the library's pinned endive version (no stale dahlia string anywhere in the repo).
- [ ] In test mode, `POST /api/stripe/checkout` returns a Checkout URL for a session created at endive with Managed Payments on, and completing it with a test card turns the test user Premium through the webhook.
- [ ] A checkout refused by Stripe (e.g. a bad price) returns the same error shape to the client as today.

Verify:
- `npm test -- <checkout and premium-checkout-session tests>` → pass
- local dev server + `stripe listen --forward-to localhost:3015/api/stripe/webhook --latest` + a test-mode checkout completed with `4242…` (Playwright headless) → user row Premium in the database the dev server uses (never production – check `DATABASE_URL` host first)

### US-2: Cancel and reactivate work on endive
As a Premium subscriber, I can cancel at period end and change my mind so that I keep Premium until the period ends, or keep paying.

Acceptance:
- [ ] `app/api/stripe/cancel` and `app/api/stripe/reactivate` each get a route test (none exist) covering success, no subscription, and someone else's subscription refused.
- [ ] In test mode both work against a real endive subscription and the user's state matches Stripe's after the webhook.

Verify:
- `npm test -- <cancel/reactivate route tests>` → pass
- the test-mode subscription from US-1 cancelled then reactivated via the routes → `cancel_at_period_end` true then false in Stripe and in the app

### US-3: Every handled webhook event is processed at endive
As the owner, I can rely on every event the webhook handles being read correctly at endive so that no Premium state drifts.

Acceptance:
- [ ] Each of the six handled event types is replayed at endive (`stripe trigger <event> --api-key …` with `stripe listen --latest` forwarding locally) and handled with 2xx and the right state change; the payloads' fields the code reads (`items.data[0].current_period_end` and the rest) exist at endive.
- [ ] A fixture-based unit test per handled event type uses an endive-shaped payload (captured from the replay, IDs anonymised) rather than a hand-made one.
- [ ] A signature with the wrong secret is still refused.

Verify:
- `npm test -- <webhook tests>` → pass
- the replay log, saved under `audit-evidence/`

### US-4: Dependency updates flow again
Acceptance:
- [ ] The `stripe` ignore rule in `.github/dependabot.yml` (today `versions: [">=22.2.0"]`) is removed.
- [ ] `npm run ci:quick` green; full `npm test` green.

## Scope
- `package.json`, `package-lock.json` [MODIFY] – stripe ^23
- `lib/stripe.ts` [MODIFY] – API version
- `lib/premium-checkout-session.ts`, `lib/subscription-notice.ts`, `lib/server/premium-pricing.ts`, `app/api/stripe/{checkout,cancel,reactivate,webhook}/route.ts`, `app/api/user/purchases/**`, `app/api/user/export/route.ts`, `lib/account-deletion.ts` [MODIFY only where endive or the 23 types require it]
- existing Stripe tests and mocks [EXISTS – extend, do not recreate]
- `.github/dependabot.yml` [MODIFY]
- `features/2026-10-29-stripe-23/migrations.md` [EXISTS – the production webhook switch; keep it true]
Out of scope: pricing, new payment features, the Control Panel's own Stripe use.
Deferred: None.

Verification cost: back end only, no viewport matrix (`N/A – no Boardly UI changes; Stripe's hosted Checkout page is Stripe's`). The costliest story is US-3 – a dev server on port 3015, `stripe listen --latest` and six `stripe trigger` replays in test mode.

## Constraints
- Money: no live-mode call of any kind; test mode only (`sk_test_` key). Production's webhook endpoint and secret are switched by the lead at release, by `migrations.md`.
- The worktree has its own `node_modules`: run `npm ci` in it. Never symlink or install into `~/Projects/boardly/node_modules` – five other worktrees share it. Same for `prisma/generated` (`npm run db:generate` in the worktree).
- Dev server only `next dev --webpack -p 3015`; stop it and `stripe listen` by PID at the end.
- Never create users or subscriptions in the production database; if `.env.local`'s `DATABASE_URL` is production, use a local Postgres or prove the DB effects with tests and say so.

## Verification
Story checks above, then the repo's gates: `npm run ci:quick` exit 0, the full `npm test` once. Live UI: none.

## Assumptions
- `2026-09-30.endive` is the version stripe-node 23.0.x pins (verify in `node_modules/stripe` after install). Verified 2026-10-29: 23.0.1, `node_modules/stripe/cjs/apiVersion.js` exports `ApiVersion = '2026-09-30.endive'`.
- The production webhook endpoint is on dahlia today (the lead checks before release).

## Open questions
None.

## Decisions
- 2026-10-29 – Agent decision: move library, client and webhook endpoint to endive in one release, with the production endpoint switched by creating a new endive endpoint and rotating `STRIPE_WEBHOOK_SECRET` at release (old endpoint disabled, not deleted, for a week). Reason: Stripe sets an endpoint's API version only at creation, and events rendered at dahlia must not reach code typed for endive. Revert: re-enable the old endpoint, restore the old secret in Vercel, redeploy the previous release.
- 2026-10-29 – Agent decision: verify against the test-mode sandbox with the `.env.local` key, not a new CLI login. Reason: the CLI login expired and a sign-in is the owner's; the key works (customers list answered 29.10). Revert: n/a.
- 2026-10-29 – Agent decision: `lib/stripe.ts` sends `Stripe.API_VERSION` behind `satisfies \`${string}.endive\``, not a hard-coded date. Reason: stripe-node 23 types `apiVersion` as its one pinned literal, so a hard-coded date fails the typecheck of every dependabot minor that pins a newer endive version and would hold updates back again (US-4); Stripe ships only additive changes within endive, and a new major fails the typecheck until the webhook endpoint has moved (checked: a `2027-03-31.fig` literal gives TS1360). Revert: put `apiVersion: '2026-09-30.endive'` back.
- 2026-10-29 – Agent decision: the two async events are replayed with `stripe trigger --raw` fixtures – a subscription-mode Checkout Session on a test user's own customer, paid by SEPA test IBANs – not the CLI's stock fixtures. Reason: the stock async fixtures create payment-mode sessions on new customers, which the route ignores by design, so they would prove only the "not ours" branch. Their setup requests run at dahlia because they send `payment_method_types`, which endive removed; the events themselves are rendered at endive by `stripe listen --latest`. Revert: n/a.
- 2026-10-29 – Agent decision: the test users' addresses are Resend's test sink (`delivered+…@resend.dev`). Reason: the paid path sends the purchase confirmation and, without a Resend key, answers 500 by design; the sink accepts mail and delivers it to nobody. Revert: n/a.

## Deviations
- 2026-10-29 – US-1 Verify, "a test-mode checkout completed with 4242 (Playwright headless)": the hosted Managed Payments page was filled with 4242 in headless Chrome, and "Pay and subscribe" raised an hCaptcha challenge (`api.hcaptcha.com/getcaptcha`, `audit-evidence/hosted-checkout-after-pay.png`); the session stayed `open`/`unpaid`. Not routed around. The page's own confirm call refuses Managed Payments sessions for this account's keys (`checkout_connect_mismatched_key`). So the route's endive session with Managed Payments was verified live up to the Checkout URL, and the paid completion turning the user Premium was replayed as a subscription Checkout Session with the same customer, price and consent metadata, paid with `tok_visa`, without Managed Payments. The Playwright MCP browser was held by another session ("Browser is already in use"), so the worktree's Playwright library drove the installed Chrome, headless, with `--use-mock-keychain`. Revert: n/a.

## Rounds
| Round | Stage | Result | Week % | Time |
|---|---|---|---|---|
| 1 | implement | in-audit @ dc089074, 1 deviation | 1 | 2026-10-29 14:55 (5 other Boardly workers running) |
| 1 | audit | | 3 | 2026-10-29 14:52 (4 Boardly workers + 1 refuter running) |
