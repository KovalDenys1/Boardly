#!/bin/bash
# Live matrix for #1322 (stripe-node 23, API 2026-09-30.endive) – audit 1, 2026-10-29.
# Dev server on 3015 + `stripe listen --latest`, test-mode key and boardly-dev only (refuses anything else).
#   live-matrix.sh serve             start both; prints READY; stays up until $WORK/stop exists, then stops both by PID
#   live-matrix.sh phase setup       test users + checkout sessions (US-1)
#   live-matrix.sh phase run         paid completion, cancel/reactivate, webhook probes, SEPA async (US-1..3)
#   live-matrix.sh phase cleanup     deleteUserAccount for every test user, expire sessions, drop checkout_started rows
#   touch "$WORK/stop"; live-matrix.sh phase ledger   after the listener stops: summary + ledger rows removed by id
# Rows land in $WORK/rows.jsonl. The audit-1 run used this script from a scratch directory; only the two path lines differ.
set -uo pipefail
WT=$(cd "$(dirname "$0")/../../.." && pwd)
WORK=${LIVE_WORK:-${TMPDIR:-/tmp}/boardly-stripe-live}
mkdir -p "$WORK"
cd "$WT"

KEY=$(node -e "const t=require('fs').readFileSync('.env.local','utf8');const m=t.match(/^STRIPE_SECRET_KEY=\"?([^\"\n]*)/m);process.stdout.write(m?m[1]:'')")
case "$KEY" in sk_test_*) ;; *) echo "refusing: not a test-mode key"; exit 1;; esac
grep '^DATABASE_URL=' .env.local | grep -q 'inmvbxfflqeblynpktay' || { echo "refusing: DATABASE_URL is not boardly-dev"; exit 1; }
export STRIPE_API_KEY="$KEY"

write_ts() {
cat > "$WORK/live-matrix.ts" <<'TS'
// Audit 1 live matrix for #1322 (stripe-node 23, API 2026-09-30.endive).
// Run from the worktree: node --env-file=.env.local node_modules/.bin/tsx --tsconfig ./tsconfig.json <this> <phase>
// Phases: setup | run | cleanup. State in $AUDIT_STATE; rows appended to $AUDIT_ROWS (JSON lines).
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { encode } from 'next-auth/jwt'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { getPremiumPricing } from '@/lib/server/premium-pricing'
import { deleteUserAccount } from '@/lib/account-deletion'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

const BASE = 'http://localhost:3015'
const STATE = process.env.AUDIT_STATE as string
const ROWS = process.env.AUDIT_ROWS as string
const WHSEC = process.env.AUDIT_WHSEC as string
const PRICE = process.env.STRIPE_PREMIUM_PRICE_ID as string
const phase = process.argv[2]

if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('refusing: not a test-mode key')
if (!process.env.DATABASE_URL?.includes('inmvbxfflqeblynpktay')) throw new Error('refusing: DATABASE_URL is not boardly-dev')
if (!STATE || !ROWS || !WHSEC?.startsWith('whsec_')) throw new Error('AUDIT_STATE, AUDIT_ROWS, AUDIT_WHSEC required')

const stripe = getStripe()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Row = { id: string; area: string; hypothesis: string; invariant: string; observed: string; result: 'PASS' | 'FAIL' | 'BLOCKED' }
function row(r: Row) {
  appendFileSync(ROWS, JSON.stringify({ ...r, at: new Date().toISOString() }) + '\n')
  console.log(`${r.result.padEnd(7)} ${r.id} – ${r.observed}`)
}
function check(id: string, area: string, hypothesis: string, invariant: string, ok: boolean, observed: string) {
  row({ id, area, hypothesis, invariant, observed, result: ok ? 'PASS' : 'FAIL' })
  return ok
}

type U = { key: string; id: string; email: string; username: string; cookie: string }
type State = { runId: string; startedAt: string; users: Record<string, U>; sessions: Record<string, string>; checkoutUrlA?: string; synthetic: string[]; subA?: string; csA?: string }
const load = (): State => JSON.parse(readFileSync(STATE, 'utf8'))
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2))

async function call(method: string, path: string, opts: { cookie?: string; body?: unknown; origin?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (opts.origin !== false) headers.Origin = BASE
  if (opts.cookie) headers.Cookie = `next-auth.session-token=${opts.cookie}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      redirect: 'manual',
      signal: AbortSignal.timeout(240_000),
    })
    const text = await res.text()
    if (res.status === 429) { await sleep(15_000); continue }
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: res.status, json, text: text.slice(0, 300) }
  }
  return { status: 429, json: null, text: 'rate limited 4 times' }
}

async function waitFor<T>(label: string, fn: () => Promise<T | null | undefined | false>, ms = 90_000): Promise<T | null> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v as T
    await sleep(1_000)
  }
  console.log(`  (timeout waiting for ${label})`)
  return null
}

const consent = () => ({ termsVersion: TERMS_VERSION, withdrawalInfoVersion: WITHDRAWAL_INFO_VERSION, acceptedAt: new Date().toISOString() })
const userRow = (id: string) => prisma.users.findUnique({ where: { id }, select: { stripeCustomerId: true, stripeSubscriptionId: true, premiumUntil: true, premiumCancelAtPeriod: true, premiumFirstGrantedAt: true } })
const ledgerHas = async (eventId: string) => !!(await prisma.stripeWebhookEvents.findUnique({ where: { id: eventId } }))

function consentMetadata(u: U) {
  const now = new Date().toISOString()
  return { userId: u.id, consentTermsVersion: TERMS_VERSION, consentWithdrawalInfoVersion: WITHDRAWAL_INFO_VERSION, consentAt: now, consentReceivedAt: now }
}

function trigger(event: string, apiVersion: string, fixture: unknown): string {
  const out = execFileSync('stripe', ['trigger', event, '--api-version', apiVersion, '--raw', JSON.stringify(fixture)], {
    env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return out
}

// The newest event of a type whose object is `objectId`, created at or after `since` (unix s).
async function newestEvent(type: string, objectId: string, since: number): Promise<Stripe.Event | null> {
  const list = await stripe.events.list({ type, created: { gte: since }, limit: 20 })
  return list.data.find((e) => (e.data.object as { id?: string }).id === objectId) ?? null
}

function sign(body: string, secret = WHSEC, timestamp?: number) {
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret, ...(timestamp ? { timestamp } : {}) })
}
async function deliver(body: string, signature?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (signature) headers['stripe-signature'] = signature
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers, body, signal: AbortSignal.timeout(240_000) })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* */ }
  return { status: res.status, json }
}

async function setup() {
  const runId = `audit1322_${Date.now().toString(36)}`
  const state: State = { runId, startedAt: new Date().toISOString(), users: {}, sessions: {}, synthetic: [] }
  for (const key of ['a', 'b', 'c', 'd']) {
    const id = `${runId}_${key}`
    const email = `delivered+${runId}-${key}@resend.dev`
    const username = `${runId}_${key}`
    await prisma.users.create({ data: { id, email, username, emailVerified: new Date(), language: 'en', termsAcceptedAt: new Date(), ageConfirmedAt: new Date() } })
    const cookie = await encode({ token: { id, sub: id, name: username, email, emailVerified: new Date().toISOString(), suspended: false }, secret: process.env.NEXTAUTH_SECRET as string })
    state.users[key] = { key, id, email, username, cookie }
  }
  save(state)
  const { a, b, c, d } = state.users

  // US-1: the route opens a Managed Payments subscription session at endive.
  const r1 = await call('POST', '/api/stripe/checkout', { cookie: a.cookie, body: { plan: 'monthly', consent: consent() } })
  const aRow = await userRow(a.id)
  let session: Stripe.Checkout.Session | null = null
  if (aRow?.stripeCustomerId) {
    const list = await stripe.checkout.sessions.list({ customer: aRow.stripeCustomerId, limit: 1 })
    session = list.data[0] ?? null
  }
  state.checkoutUrlA = r1.json?.url
  if (session) state.sessions.a = session.id
  save(state)
  check('US1-checkout', 'US-1', 'POST /api/stripe/checkout opens a subscription session with Managed Payments at endive', '200 + checkout.stripe.com URL; session mode=subscription, managed_payments.enabled, metadata.userId = caller',
    r1.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(r1.json?.url ?? '') && session?.mode === 'subscription' && session?.managed_payments?.enabled === true && session?.metadata?.userId === a.id && session?.url === r1.json?.url,
    `HTTP ${r1.status}; url ${String(r1.json?.url).slice(0, 40)}…; session ${session?.id?.slice(0, 14)}… mode=${session?.mode} managed_payments=${JSON.stringify(session?.managed_payments)} status=${session?.status} metadata.userId match=${session?.metadata?.userId === a.id}`)

  for (const u of [b, c]) {
    const r = await call('POST', '/api/stripe/checkout', { cookie: u.cookie, body: { plan: 'monthly', consent: consent() } })
    const ur = await userRow(u.id)
    const list = ur?.stripeCustomerId ? await stripe.checkout.sessions.list({ customer: ur.stripeCustomerId, limit: 1 }) : null
    if (list?.data[0]) state.sessions[u.key] = list.data[0].id
    check(`US1-checkout-${u.key}`, 'US-1', `checkout as ${u.key} creates the customer and a session`, '200 + URL, stripeCustomerId stored', r.status === 200 && !!ur?.stripeCustomerId, `HTTP ${r.status}; customer stored=${!!ur?.stripeCustomerId}`)
  }
  save(state)

  // US-1: a session Stripe refuses (yearly price id that does not exist) answers today's shape.
  const r2 = await call('POST', '/api/stripe/checkout', { cookie: d.cookie, body: { plan: 'yearly', consent: consent() } })
  check('US1-refused', 'US-1', 'a checkout Stripe refuses (bad price) answers the same error shape as today', '502 {"error":"Checkout is temporarily unavailable. Please try again in a few minutes."}',
    r2.status === 502 && JSON.stringify(r2.json) === JSON.stringify({ error: 'Checkout is temporarily unavailable. Please try again in a few minutes.' }), `HTTP ${r2.status} ${JSON.stringify(r2.json)}`)
  const dRow = await userRow(d.id)
  if (dRow?.stripeCustomerId) {
    const list = await stripe.checkout.sessions.list({ customer: dRow.stripeCustomerId, limit: 1 })
    check('US1-refused-nosession', 'US-1', 'the refused checkout leaves no session behind', 'no session on the customer', list.data.length === 0, `sessions on D's customer: ${list.data.length}`)
  }

  const r3 = await call('POST', '/api/stripe/checkout', { cookie: d.cookie, body: { plan: 'monthly' } })
  check('US1-noconsent', 'US-1', 'checkout without the consent body is still refused before Stripe', '400 code consent_required', r3.status === 400 && r3.json?.code === 'consent_required', `HTTP ${r3.status} code=${r3.json?.code}`)
  console.log(`CHECKOUT_URL_A=${state.checkoutUrlA}`)
}

async function run() {
  const state = load()
  const { a, b, c, d } = state.users
  const t0 = Math.floor(Date.now() / 1000) - 5

  // ---- US-1 paid completion (non-Managed-Payments replay, see spec Deviations) ----
  let aRow = await userRow(a.id)
  const price = await stripe.prices.retrieve(PRICE)
  let csA: string | null = null
  if (!aRow?.premiumUntil) {
    const meta = consentMetadata(a)
    const out = trigger('checkout.session.completed', '2026-09-30.endive', {
      _meta: { template_version: 0 },
      fixtures: [
        { name: 'checkout_session', path: '/v1/checkout/sessions', method: 'post', params: {
          success_url: `${BASE}/profile?premium=success`, cancel_url: `${BASE}/profile`, mode: 'subscription', customer: aRow?.stripeCustomerId,
          line_items: [{ price: PRICE, quantity: 1 }], metadata: meta, subscription_data: { metadata: meta } } },
        { name: 'payment_page', path: '/v1/payment_pages/${checkout_session:id}', method: 'get' },
        { name: 'payment_method', path: '/v1/payment_methods', method: 'post', params: { type: 'card', card: { token: 'tok_visa' },
          billing_details: { email: a.email, name: 'Audit Player', address: { line1: 'Testveien 1', postal_code: '0566', city: 'Oslo', country: 'NO' } } } },
        { name: 'payment_page_confirm', path: '/v1/payment_pages/${checkout_session:id}/confirm', method: 'post', params: { payment_method: '${payment_method:id}', expected_amount: price.unit_amount } },
      ],
    })
    console.log('  trigger A:', /Trigger succeeded/.test(out) ? 'succeeded' : out.slice(-200))
  }
  aRow = await waitFor('A premium', async () => { const r = await userRow(a.id); return r?.premiumUntil && r.stripeSubscriptionId ? r : null })
  const subA = aRow?.stripeSubscriptionId ? await stripe.subscriptions.retrieve(aRow.stripeSubscriptionId) : null
  if (subA) state.subA = subA.id
  const sessions = aRow?.stripeCustomerId ? await stripe.checkout.sessions.list({ customer: aRow.stripeCustomerId, limit: 5 }) : null
  csA = sessions?.data.find((s) => s.subscription === subA?.id)?.id ?? null
  if (csA) state.csA = csA
  save(state)
  const consentA = csA ? await waitFor('A confirmation', async () => { const r = await prisma.purchaseConsents.findUnique({ where: { checkoutSessionId: csA! } }); return r?.confirmationSentAt ? r : null }, 60_000) : null
  const periodEnd = subA?.items.data[0]?.current_period_end
  check('US1-paid', 'US-1', 'a paid subscription checkout at endive turns the user Premium through the webhook', 'premiumUntil = items.data[0].current_period_end; subscription id stored; consent row with confirmationSentAt; first grant stamped',
    !!aRow && !!subA && aRow.premiumUntil?.getTime() === (periodEnd ?? 0) * 1000 && aRow.stripeSubscriptionId === subA.id && aRow.premiumCancelAtPeriod === false && !!aRow.premiumFirstGrantedAt && !!consentA?.confirmationSentAt && consentA?.plan === 'monthly',
    `premiumUntil=${aRow?.premiumUntil?.toISOString()} vs item cpe=${periodEnd ? new Date(periodEnd * 1000).toISOString() : 'none'}; sub stored=${aRow?.stripeSubscriptionId === subA?.id}; consent plan=${consentA?.plan} confirmationSentAt=${consentA?.confirmationSentAt?.toISOString() ?? 'null'}; firstGranted=${!!aRow?.premiumFirstGrantedAt}`)

  // Field presence at endive for everything lib/subscription-notice.ts, premium-pricing.ts and the webhook read.
  if (subA) {
    const it = subA.items.data[0] as any
    const fields = {
      status: typeof subA.status === 'string', start_date: typeof subA.start_date === 'number', cancel_at: subA.cancel_at === null || typeof subA.cancel_at === 'number',
      cancel_at_period_end: typeof subA.cancel_at_period_end === 'boolean', 'metadata.userId': subA.metadata?.userId === a.id, customer: typeof subA.customer === 'string', currency: typeof subA.currency === 'string',
      'items[0].current_period_end': typeof it?.current_period_end === 'number', 'items[0].price.id': typeof it?.price?.id === 'string', 'items[0].price.unit_amount': typeof it?.price?.unit_amount === 'number',
      'items[0].price.currency': typeof it?.price?.currency === 'string', 'items[0].price.recurring.interval': it?.price?.recurring?.interval === 'month', 'items[0].price.recurring.interval_count': it?.price?.recurring?.interval_count === 1,
    }
    const missing = Object.entries(fields).filter(([, ok]) => !ok).map(([k]) => k)
    check('US3-fields', 'US-3', 'every Subscription field the code reads exists at endive', 'all present with the expected types', missing.length === 0, missing.length ? `missing/wrong: ${missing.join(', ')}` : `${Object.keys(fields).length} fields present; top-level current_period_end present=${'current_period_end' in (subA as any)}`)
  }
  const pricing = await getPremiumPricing()
  check('US1-pricing', 'US-1', '/premium pricing (prices.retrieve) still resolves at endive', 'monthly plan price resolved from Stripe', !!pricing.monthly, `monthly=${JSON.stringify(pricing.monthly)} yearly=${JSON.stringify(pricing.yearly)}`)
  const ren = await call('GET', '/api/user/purchases/renewal', { cookie: a.cookie })
  check('US1-renewal', 'US-1', 'the profile renewal line (subscriptions.retrieve with request options) answers at endive', '200 renewal.plan=monthly with a price', ren.status === 200 && ren.json?.renewal?.plan === 'monthly' && !!ren.json?.renewal?.price, `HTTP ${ren.status} ${JSON.stringify(ren.json)}`)
  const portal = await call('POST', '/api/stripe/checkout', { cookie: a.cookie, body: { plan: 'monthly', consent: consent() } })
  check('US1-portal', 'US-1', 'a Premium user asking for checkout gets the billing portal at endive', '200 + billing.stripe.com URL', portal.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(portal.json?.url ?? ''), `HTTP ${portal.status} url=${String(portal.json?.url).slice(0, 32)}…`)

  // ---- US-2 cancel / reactivate on a real endive subscription ----
  if (subA) {
    const other = await call('POST', '/api/stripe/cancel', { cookie: d.cookie, body: { subscriptionId: subA.id, userId: a.id } })
    const afterOther = await stripe.subscriptions.retrieve(subA.id)
    check('US2-other', 'US-2', "naming someone else's subscription does not reach it", 'D (no subscription) gets 400; A\'s subscription unchanged in Stripe', other.status === 400 && afterOther.cancel_at_period_end === false, `HTTP ${other.status} ${JSON.stringify(other.json)}; A cancel_at_period_end=${afterOther.cancel_at_period_end}`)

    for (const [step, path, want] of [['cancel', '/api/stripe/cancel', true], ['reactivate', '/api/stripe/reactivate', false]] as const) {
      const since = Math.floor(Date.now() / 1000) - 2
      const r = await call('POST', path, { cookie: a.cookie })
      const sub = await stripe.subscriptions.retrieve(subA.id)
      const dbNow = await userRow(a.id)
      const evt = await waitFor(`${step} event`, async () => { const e = await newestEvent('customer.subscription.updated', subA.id, since); return e && (e.data.object as Stripe.Subscription).cancel_at_period_end === want ? e : null }, 30_000)
      const processed = evt ? await waitFor(`${step} processed`, () => ledgerHas(evt.id), 30_000) : null
      const dbAfter = await userRow(a.id)
      check(`US2-${step}`, 'US-2', `${step} sets cancel_at_period_end=${want} in Stripe and in the app, before and after the webhook`, 'Stripe == route write == webhook result; premiumUntil unchanged',
        r.status === 200 && sub.cancel_at_period_end === want && dbNow?.premiumCancelAtPeriod === want && !!processed && dbAfter?.premiumCancelAtPeriod === want && dbAfter?.premiumUntil?.getTime() === aRow?.premiumUntil?.getTime(),
        `HTTP ${r.status}; Stripe ${sub.cancel_at_period_end}; row after route ${dbNow?.premiumCancelAtPeriod}; event ${evt?.id?.slice(0, 12)}… api ${evt?.api_version} processed=${!!processed}; row after webhook ${dbAfter?.premiumCancelAtPeriod}; premiumUntil kept=${dbAfter?.premiumUntil?.getTime() === aRow?.premiumUntil?.getTime()}`)
    }

    // Rapid toggle: four writes back to back, then compare the row with Stripe once every event is processed.
    const since = Math.floor(Date.now() / 1000) - 2
    const statuses: number[] = []
    for (const path of ['/api/stripe/cancel', '/api/stripe/reactivate', '/api/stripe/cancel', '/api/stripe/reactivate']) statuses.push((await call('POST', path, { cookie: a.cookie })).status)
    const events = await waitFor('4 toggle events', async () => { const l = await stripe.events.list({ type: 'customer.subscription.updated', created: { gte: since }, limit: 20 }); const mine = l.data.filter((e) => (e.data.object as Stripe.Subscription).id === subA.id); return mine.length >= 4 ? mine : null }, 45_000)
    const allProcessed = events ? await waitFor('toggle processed', async () => { for (const e of events) if (!(await ledgerHas(e.id))) return false; return true }, 45_000) : null
    await sleep(2_000)
    const final = await stripe.subscriptions.retrieve(subA.id)
    const dbFinal = await userRow(a.id)
    check('US2-toggle', 'US-2', 'four cancel/reactivate writes back to back end with the row matching Stripe', 'row.premiumCancelAtPeriod == Stripe cancel_at_period_end once every update event is processed',
      statuses.every((s) => s === 200) && !!allProcessed && dbFinal?.premiumCancelAtPeriod === final.cancel_at_period_end,
      `HTTP ${statuses.join(',')}; events ${events?.length ?? 0} processed=${!!allProcessed}; Stripe ${final.cancel_at_period_end}; row ${dbFinal?.premiumCancelAtPeriod}`)

    // ---- US-3 webhook verification probes with a real endive event ----
    const lastEvt = events?.[0] ?? (await newestEvent('customer.subscription.updated', subA.id, t0))
    if (lastEvt) {
      const body = JSON.stringify(lastEvt)
      const before = await userRow(a.id)
      const dup = await deliver(body, sign(body))
      const afterDup = await userRow(a.id)
      check('US3-duplicate', 'US-3', 'a redelivered endive event is claimed once', '200 {received,duplicate:true}; row unchanged', dup.status === 200 && dup.json?.duplicate === true && JSON.stringify(before) === JSON.stringify(afterDup), `HTTP ${dup.status} ${JSON.stringify(dup.json)}; row unchanged=${JSON.stringify(before) === JSON.stringify(afterDup)}; event api_version=${lastEvt.api_version}`)
      const wrong = await deliver(body, sign(body, 'whsec_audit_wrong_secret_1322'))
      const missing = await deliver(body)
      const stale = await deliver(body, sign(body, WHSEC, Math.floor(Date.now() / 1000) - 600))
      const tampered = body.slice(0, -1) + ',"audit":1}'
      const tamperedRes = await deliver(tampered, sign(body))
      check('US3-signature', 'US-3', 'a payload signed with the wrong secret, unsigned, 10 minutes old or altered is refused', '400 each, nothing claimed',
        wrong.status === 400 && wrong.json?.error === 'Invalid signature' && missing.status === 400 && missing.json?.error === 'Missing signature' && stale.status === 400 && tamperedRes.status === 400,
        `wrong secret ${wrong.status} ${JSON.stringify(wrong.json)}; unsigned ${missing.status} ${JSON.stringify(missing.json)}; 600 s old ${stale.status}; altered body ${tamperedRes.status}`)
    }
    const synthId = `evt_${state.runId}_unhandled`
    state.synthetic.push(synthId)
    save(state)
    const synth = JSON.stringify({ id: synthId, object: 'event', api_version: '2026-09-30.endive', created: Math.floor(Date.now() / 1000), type: 'invoice.paid', livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, data: { object: { id: 'in_audit1322', object: 'invoice' } } })
    const unhandled = await deliver(synth, sign(synth))
    check('US3-unhandled', 'US-3', 'an event type the route does not handle is acknowledged and claimed', '200 {received:true}, ledger row', unhandled.status === 200 && unhandled.json?.received === true && (await ledgerHas(synthId)), `HTTP ${unhandled.status} ${JSON.stringify(unhandled.json)}`)

    // customer.subscription.deleted revokes.
    await stripe.subscriptions.cancel(subA.id)
    const revoked = await waitFor('A revoked', async () => { const r = await userRow(a.id); return r && r.premiumUntil === null && r.stripeSubscriptionId === null ? r : null }, 60_000)
    check('US3-deleted', 'US-3', 'customer.subscription.deleted at endive revokes Premium', 'premiumUntil null, subscription id null, cancel flag false, first grant kept', !!revoked && revoked.premiumCancelAtPeriod === false && !!revoked.premiumFirstGrantedAt, `row ${JSON.stringify(revoked)}`)
    const c1 = await call('POST', '/api/stripe/cancel', { cookie: a.cookie })
    const r1 = await call('POST', '/api/stripe/reactivate', { cookie: a.cookie })
    check('US2-none-after-delete', 'US-2', 'with the subscription gone, cancel and reactivate answer 400', '400 No active subscription found / No subscription found', c1.status === 400 && r1.status === 400 && c1.json?.error === 'No active subscription found' && r1.json?.error === 'No subscription found', `cancel ${c1.status} ${JSON.stringify(c1.json)}; reactivate ${r1.status} ${JSON.stringify(r1.json)}`)
  }

  const dc = await call('POST', '/api/stripe/cancel', { cookie: d.cookie })
  const dr = await call('POST', '/api/stripe/reactivate', { cookie: d.cookie })
  const so = await call('POST', '/api/stripe/cancel', {})
  const noOrigin = await call('POST', '/api/stripe/cancel', { cookie: d.cookie, origin: false })
  check('US2-negative', 'US-2', 'no subscription, signed out and cross-origin writes are refused', '400 / 400 / 401 / 403', dc.status === 400 && dr.status === 400 && so.status === 401 && noOrigin.status === 403, `no sub cancel ${dc.status}, reactivate ${dr.status}; signed out ${so.status}; no Origin ${noOrigin.status}`)

  // ---- US-3 async payment events on subscription sessions paid by SEPA test IBANs ----
  const premiumProduct = typeof price.product === 'string' ? price.product : price.product.id
  for (const [u, iban, outcome] of [[b, 'AT611904300234573201', 'succeeded'], [c, 'AT861904300235473202', 'failed']] as const) {
    const ur = await userRow(u.id)
    const meta = consentMetadata(u)
    const sessionParams: Record<string, unknown> = {
      success_url: `${BASE}/profile?premium=success`, cancel_url: `${BASE}/profile`, mode: 'subscription', customer: ur?.stripeCustomerId,
      line_items: [{ price_data: { currency: 'eur', product: premiumProduct, unit_amount: price.unit_amount, recurring: { interval: 'month' } }, quantity: 1 }],
      metadata: meta, subscription_data: { metadata: meta },
    }
    const fixtures = (pmtKey: 'allowed_payment_method_types' | 'payment_method_types') => ({
      _meta: { template_version: 0 },
      fixtures: [
        { name: 'checkout_session', path: '/v1/checkout/sessions', method: 'post', params: { ...sessionParams, [pmtKey]: ['sepa_debit'] } },
        { name: 'payment_page', path: '/v1/payment_pages/${checkout_session:id}', method: 'get' },
        { name: 'payment_method', path: '/v1/payment_methods', method: 'post', params: { type: 'sepa_debit', sepa_debit: { iban }, billing_details: { email: u.email, name: 'Audit Player', address: { line1: 'Testveien 1', city: 'Oslo', postal_code: '0566', country: 'NO' } } } },
        { name: 'payment_page_confirm', path: '/v1/payment_pages/${checkout_session:id}/confirm', method: 'post', params: { payment_method: '${payment_method:id}', expected_amount: price.unit_amount } },
      ],
    })
    let how = 'endive + allowed_payment_method_types'
    try {
      trigger(`checkout.session.async_payment_${outcome}`, '2026-09-30.endive', fixtures('allowed_payment_method_types'))
    } catch (err) {
      how = `dahlia + payment_method_types (endive setup failed: ${String((err as { stderr?: string }).stderr ?? err).split('\n').find((l) => /error|Error/.test(l))?.slice(0, 120)})`
      trigger(`checkout.session.async_payment_${outcome}`, '2026-04-22.dahlia', fixtures('payment_method_types'))
    }
    const cs = await waitFor(`${u.key} session`, async () => { const l = await stripe.checkout.sessions.list({ customer: ur!.stripeCustomerId!, limit: 5 }); return l.data.find((s) => s.status === 'complete') ?? null }, 60_000)
    const pending = cs ? await waitFor(`${u.key} consent`, () => prisma.purchaseConsents.findUnique({ where: { checkoutSessionId: cs.id } }), 60_000) : null
    const asyncEvt = cs ? await waitFor(`${u.key} async event`, async () => { const l = await stripe.events.list({ type: `checkout.session.async_payment_${outcome}`, limit: 10 }); return l.data.find((e) => (e.data.object as Stripe.Checkout.Session).id === cs.id) ?? null }, 240_000) : null
    const processed = asyncEvt ? await waitFor(`${u.key} async processed`, () => ledgerHas(asyncEvt.id), 60_000) : null
    await sleep(3_000)
    const after = await userRow(u.id)
    const consentAfter = cs ? await prisma.purchaseConsents.findUnique({ where: { checkoutSessionId: cs.id } }) : null
    const completedEvt = cs ? (await stripe.events.list({ type: 'checkout.session.completed', limit: 10 })).data.find((e) => (e.data.object as Stripe.Checkout.Session).id === cs.id) : null
    const completedUnpaid = (completedEvt?.data.object as Stripe.Checkout.Session | undefined)?.payment_status === 'unpaid'
    if (outcome === 'succeeded') {
      check('US3-async-succeeded', 'US-3', 'completed (unpaid) records the consent only; async_payment_succeeded grants and confirms', 'consent row; completed event unpaid; after success premiumUntil set and confirmationSentAt set',
        !!pending && completedUnpaid && !!processed && !!after?.premiumUntil && !!consentAfter?.confirmationSentAt,
        `setup at ${how}; completed unpaid=${completedUnpaid} (${completedEvt?.api_version}); consent row first seen with confirmationSentAt=${pending?.confirmationSentAt?.toISOString() ?? 'null'}; async event ${asyncEvt?.api_version} processed=${!!processed}; premiumUntil=${after?.premiumUntil?.toISOString() ?? 'null'}; confirmationSentAt=${consentAfter?.confirmationSentAt?.toISOString() ?? 'null'}`)
    } else {
      const subId = typeof cs?.subscription === 'string' ? cs.subscription : cs?.subscription?.id
      const pastDue = subId ? await waitFor('C past_due event', async () => { const l = await stripe.events.list({ type: 'customer.subscription.updated', limit: 20 }); return l.data.find((e) => (e.data.object as Stripe.Subscription).id === subId && (e.data.object as Stripe.Subscription).status === 'past_due') ?? null }, 120_000) : null
      const pastDueProcessed = pastDue ? await waitFor('C past_due processed', () => ledgerHas(pastDue.id), 60_000) : null
      const subEnd = await userRow(u.id)
      check('US3-async-failed', 'US-3', 'async_payment_failed sends nothing and the past_due update leaves no Premium', 'consent row with confirmationSentAt null; premiumUntil null after the past_due update is processed',
        !!pending && completedUnpaid && !!processed && !!pastDueProcessed && subEnd?.premiumUntil === null && consentAfter?.confirmationSentAt === null,
        `setup at ${how}; completed unpaid=${completedUnpaid}; async event ${asyncEvt?.api_version} processed=${!!processed}; past_due event ${pastDue?.api_version} processed=${!!pastDueProcessed}; premiumUntil=${subEnd?.premiumUntil?.toISOString() ?? 'null'}; confirmationSentAt=${consentAfter?.confirmationSentAt?.toISOString() ?? 'null'}; firstGranted=${!!subEnd?.premiumFirstGrantedAt}`)
    }
  }
}

async function cleanup() {
  const state = load()
  const results: string[] = []
  for (const key of Object.keys(state.sessions)) {
    try { const s = await stripe.checkout.sessions.retrieve(state.sessions[key]); if (s.status === 'open') await stripe.checkout.sessions.expire(s.id); results.push(`${key}: session ${s.status}->${s.status === 'open' ? 'expired' : s.status}`) } catch (e) { results.push(`${key}: session ${(e as Error).message}`) }
  }
  for (const u of Object.values(state.users)) {
    const res = await deleteUserAccount(u.id, { reason: 'owner_request' })
    results.push(`${u.key}: ${JSON.stringify(res)}`)
  }
  check('cleanup-deletion', 'Cleanup', 'account deletion cancels and deletes at endive', 'every test user deleted', results.filter((r) => r.includes('"status":"deleted"')).length === Object.keys(state.users).length, results.join('; '))
  const left = await prisma.users.count({ where: { id: { startsWith: state.runId } } })
  const consents = await prisma.purchaseConsents.count({ where: { userId: { startsWith: state.runId } } })
  const ops = await prisma.operationalEvents.findMany({ where: { eventName: 'checkout_started', createdAt: { gte: new Date(state.startedAt) } }, select: { id: true } })
  await prisma.operationalEvents.deleteMany({ where: { id: { in: ops.map((o) => o.id) } } })
  await sleep(10_000)
  console.log(`users left ${left}; consents left ${consents}; checkout_started rows deleted ${ops.length} (${ops.map((o) => o.id).join(',')})`)
}

// After the listener stops: summarise what it forwarded and remove those ledger rows (ids only).
async function ledger() {
  const state = load()
  const log = readFileSync(process.env.AUDIT_LISTEN_LOG as string, 'utf8')
  const ids = new Set<string>(state.synthetic)
  const versions: Record<string, number> = {}
  const statuses: Record<string, number> = {}
  for (const line of log.split('\n')) {
    for (const m of line.matchAll(/evt_[A-Za-z0-9]+/g)) ids.add(m[0])
    const v = line.match(/"api_version":\s*"([^"]+)"/)
    if (v && /"object":\s*"event"/.test(line)) versions[v[1]] = (versions[v[1]] ?? 0) + 1
    const s = line.match(/<--\s+\[(\d{3})\]/)
    if (s) statuses[s[1]] = (statuses[s[1]] ?? 0) + 1
  }
  const present = await prisma.stripeWebhookEvents.count({ where: { id: { in: [...ids] } } })
  const del = await prisma.stripeWebhookEvents.deleteMany({ where: { id: { in: [...ids] } } })
  console.log(`listener ids ${ids.size}; event api_versions ${JSON.stringify(versions)}; forward statuses ${JSON.stringify(statuses)}; ledger rows present ${present}, deleted ${del.count}`)
}

const main = async () => {
  if (phase === 'setup') await setup()
  else if (phase === 'run') await run()
  else if (phase === 'cleanup') await cleanup()
  else if (phase === 'ledger') await ledger()
  else throw new Error('phase?')
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error('ERR', e?.message ?? e); await prisma.$disconnect(); process.exit(1) })
TS
}

case "${1:-}" in
  serve)
    rm -f "${WORK:?}/stop"
    WHSEC=$(stripe listen --print-secret 2>/dev/null)
    case "$WHSEC" in whsec_*) ;; *) echo "no listen secret"; exit 1;; esac
    umask 077; printf '%s' "$WHSEC" > "$WORK/whsec"
    nohup stripe listen --latest --format JSON --forward-to localhost:3015/api/stripe/webhook > "$WORK/listen.log" 2>&1 &
    LPID=$!; echo "$LPID" > "$WORK/listen.pid"
    STRIPE_WEBHOOK_SECRET="$WHSEC" STRIPE_PREMIUM_PRICE_ID_YEARLY=price_does_not_exist_audit1322 NEXTAUTH_URL=http://localhost:3015 \
      nohup nice -n 10 node_modules/.bin/next dev --webpack -p 3015 > "$WORK/dev.log" 2>&1 &
    DPID=$!; echo "$DPID" > "$WORK/dev.pid"
    stop_all() {
      for p in $(pgrep -P "$DPID" 2>/dev/null) ; do for q in $(pgrep -P "$p" 2>/dev/null); do kill "$q" 2>/dev/null; done; kill "$p" 2>/dev/null; done
      kill "$DPID" "$LPID" 2>/dev/null
      rm -f "${WORK:?}/whsec"
      echo "STOPPED dev=$DPID listen=$LPID"
    }
    trap stop_all EXIT
    for i in $(seq 1 180); do grep -q "Ready in" "$WORK/dev.log" && break; sleep 1; done
    for i in $(seq 1 60); do grep -q -i "ready" "$WORK/listen.log" && break; sleep 1; done
    grep -q "Ready in" "$WORK/dev.log" && echo "READY dev=$DPID listen=$LPID" || { echo "dev server not ready"; tail -20 "$WORK/dev.log"; exit 1; }
    for i in $(seq 1 4500); do [ -f "$WORK/stop" ] && break; kill -0 "$DPID" 2>/dev/null || { echo "dev server died"; break; }; sleep 1; done
    ;;
  phase)
    write_ts
    NODE_PATH="$WT/node_modules" AUDIT_STATE="$WORK/state.json" AUDIT_ROWS="$WORK/rows.jsonl" AUDIT_WHSEC="$(cat "$WORK/whsec" 2>/dev/null || echo whsec_none)" AUDIT_LISTEN_LOG="$WORK/listen.log" \
      node --env-file=.env.local node_modules/.bin/tsx --tsconfig ./tsconfig.json "$WORK/live-matrix.ts" "$2"
    ;;
  *) echo "usage: live-matrix.sh serve | phase <setup|run|cleanup|ledger>"; exit 2;;
esac
