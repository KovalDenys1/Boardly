# Migrations and deploy – Stripe 23 and API version endive

## Database
- None.

## Environment variables
| Name | Where | Secret | Default | Purpose |
|---|---|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Vercel Production (and Preview if it points at live) | yes | – | rotated to the new endive endpoint's signing secret |

## Order
1. Before the release – read the live webhook endpoint (`GET /v1/webhook_endpoints`, live key from `vercel env pull` into a temp file, deleted after): its URL, `api_version`, `enabled_events`.
2. Create a second live endpoint with the same URL and events and `api_version=2026-09-30.endive`; put its secret into Vercel Production `STRIPE_WEBHOOK_SECRET`.
3. The release (develop → main) deploys stripe 23.
4. Right after the deploy is live – disable the old dahlia endpoint (not delete). Watch the next real event, or `stripe events list` for failures, for a week.
5. After a clean week – delete the old endpoint.

Rollback: re-enable the old endpoint, restore the previous secret, redeploy the previous release.

Later bumps: a stripe-node minor that pins a newer endive version needs no endpoint change. A new major fails the typecheck in `lib/stripe.ts` until this order has been repeated for it.
