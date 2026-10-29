# Audit – Stripe 23 and API version endive

## Audit 1 – 2026-10-29 15:23
Branch: feature/1322-stripe-23 @ 4aba1e4a | Verdict: APPROVED
Skills applied: superpowers:test-driven-development, superpowers:systematic-debugging | Evidence: `audit-evidence/audit-1.md`

### Verified
- US-1 PASS, Managed Payments completion BLOCKED – `package.json` `^23.0.1`, lockfile 23.0.1, `node_modules/stripe/cjs/apiVersion.js` → `2026-09-30.endive`; `git grep -n dahlia -- . ':(exclude)features'` → nothing. Live at endive: `POST /api/stripe/checkout` → 200 with a Checkout URL for a subscription session with `managed_payments.enabled: true`; a paid subscription checkout (`tok_visa`, same customer, price and consent metadata, no Managed Payments) → Premium through the webhook, `premiumUntil` = `items.data[0].current_period_end` (2026-11-29T14:06:19Z both), consent row confirmed; a bad price → 502 with today's body; no consent → 400 `consent_required`. The hosted Managed Payments page was not completed – see Gaps.
- US-2 PASS – `stripe-cancel-reactivate.test.ts` 10 passed (success, no subscription, someone else's subscription, signed out, Stripe before the row). Live on a real endive subscription: cancel → Stripe true, row true after the route and after the processed webhook; reactivate → false and false; four writes back to back → row = Stripe; D naming A's subscription → 400, A unchanged.
- US-3 PASS – `stripe listen --latest` forwarded 70 events, 70 × 200, 70 × `2026-09-30.endive`, all six handled types among them (created 3, updated 7, deleted 3, completed 3, async succeeded 1, async failed 1), each with the expected state change; 13 of 13 Subscription fields the code reads present at endive, no top-level `current_period_end`; wrong secret, unsigned, 600 s old and altered payloads → 400; a duplicate → 200 `duplicate: true`; `stripe-webhook-endive.test.ts` 16 passed with real stripe-node 23 signatures. The fixtures' anonymiser also renamed keys – F-1.
- US-4 PASS – `grep -i stripe .github/dependabot.yml` → nothing.
- Gate PASS – `npm run ci:quick` exit 0 (85 lint warnings, none in the branch's files); `npm test` → 543 suites, 5851 tests passed, exit 0; the 14 Stripe suites → 157 passed.
- migrations.md PASS – no new variable; the `STRIPE_WEBHOOK_SECRET` rotation is documented. The secret split keeps dahlia payloads from endive code and the reverse: until the deploy the endive endpoint's deliveries fail 400 and are retried, after it the old endpoint's do, and the event-id ledger turns a retry of a handled event into `duplicate: true`, so nothing is lost or applied twice. Rollback stated; after one, the endive endpoint fails 400 until disabled, which is harmless.
- Type guard PASS – `` '2027-03-31.fig' satisfies `${string}.endive` `` → TS1360; `'2026-10-28.endive'` → nothing.
- red_green – exit 0, "proven – 1 of 3 changed test files fail without the change" (`stripe-client.test.ts`). The other two characterise route code this branch does not change; 7 of 8 mutants of that code fail them (M5 survives the endive file – F-1).

### Adversarial
- Coverage: 24 scripted rows – 23 PASS, 1 FAIL (US2-negative expected 403 for a missing Origin, which `lib/csrf.ts:148-151` allows in development; re-probed cross-origin → 403 PASS) · 5 manual rows – 2 PASS, 3 BLOCKED (the Managed Payments completion) · 8 mutants – 7 killed, 1 survived in the endive file.
- Gaps: a Managed Payments completion at endive was never observed. hCaptcha stopped the implementer's headless browser, the Playwright MCP was held by another session, the payment-page API refuses this account's key for MP sessions (`checkout_connect_mismatched_key`, reproduced), and the sandbox holds no completed MP session to read. The risk is bounded: the handler has no Managed Payments branch, the endive changelog has no Managed Payments entry, and the completed-session fields the route reads were observed at endive with the same mode, customer, price and metadata. Whatever differs for MP differs the same way at dahlia, so this change does not introduce it. The plan's Deferred human check before release, and migrations step 4 (watch the next real event) after it, are where it shows. Not run: a renewal on a test clock (same handler and field as the update rows) and out-of-order update delivery (Stripe does not guarantee order; the toggle probe passed once).

### Live UI
- Gate: N/A – the spec sets Live UI to none: no Boardly UI changed and the hosted Checkout page is Stripe's. The flows the change reaches (buy Premium, cancel, reactivate, billing portal, renewal line) were driven over the routes their buttons call, and the rows they leave were read back.
- Baseline matrix: N/A – no browser matrix for a back-end change. The live HTTP matrix is `features/2026-10-29-stripe-23/audit-evidence/live-matrix.sh` (`serve`, then `phase setup|run|cleanup|ledger`) → 23 PASS, 1 FAIL (probe expectation).
- Walkthrough: N/A – no Boardly screen or flow changed.
- Coverage: 24 scripted and 5 manual rows, counts above.
- UI defects: None · Limits and clean-up: the Managed Payments completion is BLOCKED (Gaps). Dev server 87747 and listener 87746 stopped by PID; users A–D removed through `deleteUserAccount` at endive, 3 `checkout_started` and 71 ledger rows deleted by id; read back – 0 test users in boardly-dev, 0 test customers in the sandbox, today's 6 subscriptions all canceled; `next dev` rewrote `AGENTS.md` on start, restored.

### Findings
- F-1 [minor] The fixture anonymiser renamed keys and an enum value, not only IDs – `__tests__/fixtures/stripe-endive/checkout.session.completed.json:42` – `currency_fixture0001` stands where Stripe sent `currency_conversion` in all four Checkout fixtures; `customer.subscription.updated.json:201` holds `previous_attributes` as `previous_fixture0001`; `billing_thresholds` (8), `pause_collection`, `after_expiration`, `collected_information`, `consent_collection`, `integration_identifier` and a `marketing_*` key (4 each) are renamed the same way, and `collection_method` reads `charge_fixture0001`; mutant M5 (`app/api/stripe/webhook/route.ts:361` ignoring `currency_conversion`) passes all 16 endive tests – the fixtures are not the payload Stripe sends at endive, so they cannot pin the `currency_conversion` read or anything under the renamed keys; today the older hand-made webhook test still catches M5 – rename the keys and the enum value back (the values under them are intact) and anonymise by Stripe ID prefix on values only; assert `convertedFrom: null` in the paid endive test so M5 fails it – Invariant: every key in a captured fixture, and every value that is not an ID, is what Stripe sent at endive – Hardest case: snake_case keys and enum values shaped like IDs, such as `previous_attributes` holding an object, `collection_method: charge_automatically` and the nested `items.data[].billing_thresholds`.

### Minimality
- Lean within scope: in `lib/stripe.ts` a constant, its use and one comment line; a comment in `lib/premium-checkout-session.ts`; the version bump; the dependabot rule removed; the two test files the spec asks for plus one fixture test. No new helper or dependency.

### Beyond-spec review
- `docs/DEPENDENCY_UPGRADE_PLAN.md` stripe row – endorsed; the "no stale dahlia string" criterion needs it.
- The unpaid `checkout.session.completed` fixture test – endorsed; it pins the #1179 rule at endive (M2 fails it).

### Open questions
- None

### Follow-ups
- SEPA, pre-existing and the same at dahlia: `customer.subscription.created` grants Premium while the first debit is processing, and a failed debit leaves `premiumFirstGrantedAt` stamped (row US3-async-failed). The plan notes Managed Payments offers only card and cashapp today, so nothing reaches it yet; a separate ticket before any delayed method is enabled.
- A duplicate claim logs ERROR "Database query failed" (P2002 on `StripeWebhookEvents_pkey`) before INFO "Ignoring duplicate" – error-level noise on every Stripe retry; catch P2002 quietly in the claim.
- `next dev` (Next 16.4.2) rewrites the generated block of `AGENTS.md` (`#` → `##`) on every start, which leaves an uncommitted change in each worktree that runs it (red_green refuses a dirty tree with exit 2); commit the generated heading or set `agentRules: false`.
