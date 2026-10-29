# Plan – Stripe 23 and API version endive
Skills: superpowers:test-driven-development for all code; superpowers:systematic-debugging for any replay that fails.

- [ ] T1 (US-1) `npm ci` in the worktree, then `npm install stripe@^23` – the upgrade itself; read `node_modules/stripe` for the pinned version
- [ ] T2 (US-1..3) Read the endive changelog in full and list every field the code reads that changed – the risk map for the rest
- [ ] T3 (US-1) `lib/stripe.ts` on endive; fix the type errors `tsc` shows, each by the changelog, not by a cast
- [ ] T4 (US-2) Route tests for cancel and reactivate, failing first where behaviour is missing, then green
- [ ] T5 (US-3) Capture endive payloads for the six handled events with `stripe listen --latest` + `stripe trigger`; anonymise into fixtures; a unit test per event
- [ ] T6 (US-1, US-2) End-to-end in test mode: checkout with a test card, then cancel and reactivate through the routes; evidence in `audit-evidence/`
- [ ] T7 (US-4) Remove the stripe ignore rule from `.github/dependabot.yml`
- [ ] T8 Gates: `npm run ci:quick`, full `npm test` once; keep `migrations.md` true
