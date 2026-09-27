import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { claimOnce, release } from '@/lib/webhook-dedupe'

const log = apiLogger('/api/resend/inbound')

const RESEND_API_URL = 'https://api.resend.com'

// Longer than the signature's own 5-minute freshness window (verifySignature
// below), so a claim outlives every replay the signature check would still
// accept (#1121).
const REPLAY_DEDUPE_TTL_SECONDS = 10 * 60

// Resend signs webhooks with the svix scheme: HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{body}" keyed with the base64 part of the
// whsec_ secret. The svix-signature header can carry several
// space-separated "v1,<base64>" candidates (secret rotation).
function verifySignature(req: NextRequest, body: string): boolean {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signatures = req.headers.get('svix-signature')
  if (!secret || !id || !timestamp || !signatures) return false

  // Reject stale deliveries to limit replay.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 60 * 5) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest()

  return signatures.split(' ').some((candidate) => {
    const [version, sig] = candidate.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

// Resend retries on a non-2xx. A 4xx from its own API is permanent — a deleted
// message, a malformed forward — so answering 500 there just replays the same
// failure on a schedule. Only ask for a retry when the failure could pass
// (network, 429, 5xx) (#824).
function isTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

// Best-effort plain-text rendering of the inbound HTML, used only when Resend
// gives no `text` part. The forwarded message's body is always plain text now
// (#1121) — the sender's original HTML travels as an attachment instead of
// being rendered inline, so this stripping is for readability, not a
// security boundary.
function htmlToPlainText(html: string | null | undefined): string | null {
  if (!html) return null
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim()
  return text || null
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  if (!verifySignature(req, body)) {
    log.error('Inbound webhook signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // verifySignature already required a non-empty svix-id to pass.
  const svixId = req.headers.get('svix-id') as string
  const dedupeKey = `resend-inbound:${svixId}`
  const claim = await claimOnce(dedupeKey, REPLAY_DEDUPE_TTL_SECONDS, 'resend-inbound')
  if (claim === 'duplicate') {
    log.info('Ignoring a replayed inbound webhook delivery', { svixId })
    return NextResponse.json({ received: true, duplicate: true })
  }

  let event: { type?: string; data?: { email_id?: string } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (event.type !== 'email.received' || !event.data?.email_id) {
    return NextResponse.json({ received: true, ignored: true })
  }

  const forwardTo = process.env.SUPPORT_FORWARD_TO
  const apiKey = process.env.RESEND_API_KEY
  if (!forwardTo || !apiKey) {
    log.error('SUPPORT_FORWARD_TO or RESEND_API_KEY is not configured')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  // The webhook payload is metadata only; the body must be fetched separately.
  const emailRes = await fetch(
    `${RESEND_API_URL}/emails/receiving/${event.data.email_id}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )
  if (!emailRes.ok) {
    log.error('Failed to fetch received email', undefined, {
      emailId: event.data.email_id,
      status: emailRes.status,
    })
    const transient = isTransient(emailRes.status)
    // A 500 here asks Resend to retry with the same svix-id (#824); that retry
    // must not see its own earlier attempt as a duplicate (#1121), or the
    // message is dropped for good on the first hiccup instead of retried.
    if (transient) await release(dedupeKey, 'resend-inbound')
    return NextResponse.json({ error: 'Fetch failed' }, { status: transient ? 500 : 200 })
  }

  const email: {
    from?: string
    to?: string[]
    subject?: string
    html?: string | null
    text?: string | null
  } = await emailRes.json()

  // The sender's HTML never becomes the message body: a support inbox is a
  // reasonable phishing target ("From: Boardly Support"), and rendering
  // arbitrary sender HTML inline hands the recipient's mail client whatever
  // markup, remote images or scripts the sender wrote (#1121). It travels as
  // an attachment instead — visible to whoever triages it, never rendered by
  // default.
  const attachments = email.html
    ? [{ filename: 'original-message.html', content: Buffer.from(email.html, 'utf-8').toString('base64') }]
    : undefined

  const sendRes = await fetch(`${RESEND_API_URL}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Boardly Support <support@boardly.online>',
      to: [forwardTo],
      reply_to: email.from,
      subject: `[${email.to?.[0] ?? 'inbound'}] ${email.subject ?? '(no subject)'}`,
      text: email.text ?? htmlToPlainText(email.html) ?? '(no text body)',
      ...(attachments ? { attachments } : {}),
    }),
  })

  if (!sendRes.ok) {
    log.error('Failed to forward received email', undefined, {
      emailId: event.data.email_id,
      status: sendRes.status,
    })
    const transient = isTransient(sendRes.status)
    // Same reasoning as the fetch failure above: don't let this attempt's own
    // claim block Resend's retry of the same delivery id.
    if (transient) await release(dedupeKey, 'resend-inbound')
    return NextResponse.json({ error: 'Forward failed' }, { status: transient ? 500 : 200 })
  }

  log.info('Inbound email forwarded', {
    emailId: event.data.email_id,
    from: email.from,
    to: email.to,
  })
  return NextResponse.json({ received: true })
}
