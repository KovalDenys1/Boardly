/**
 * Email redaction for anything that leaves the database: log lines above all (#1132).
 *
 * A log line goes to Vercel's log store and to any drain attached to it, outside the
 * database's access controls, so an address written there is a copy of personal data
 * with no purpose the userId does not already serve (GDPR Art. 5(1)(c), 32(1)). Call
 * sites log the userId; the logger runs every entry through `redactLogValue` as the
 * backstop for the ones that forget, and for addresses that arrive inside someone
 * else's text (a provider's error message, an inbound mail's headers).
 */

// "jane.doe@example.com" -> "ja***@example.com". Enough to tell two addresses apart
// on the same domain when debugging, not enough to write to the person. A local part
// of one or two characters keeps only its first, so "ab@x.io" is not left whole.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) {
    return '***'
  }
  const local = email.slice(0, at)
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1)
  return `${visible}***${email.slice(at)}`
}

// Deliberately loose: a false positive masks a harmless string, a false negative
// logs an address. `*` is not in the local-part class, so an already masked
// address never matches again.
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

export function redactEmailsInText(text: string): string {
  return text.includes('@') ? text.replace(EMAIL_IN_TEXT, (match) => maskEmail(match)) : text
}

// email, userEmail, oauthEmail, pendingEmail, previousEmail... but not emailId,
// emailsSent or pendingEmailChange, which hold no address.
const EMAIL_KEY = /email$/i

const MAX_DEPTH = 8

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function redact(value: unknown, keyIsEmail: boolean, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    // Under an email-named key the whole value is masked even when it does not look
    // like an address ("jane@localhost", a typo), since that is what the key says it is.
    return keyIsEmail && value.length > 0 ? maskEmail(value) : redactEmailsInText(value)
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]'
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  if (value instanceof Error) {
    // JSON.stringify writes an Error as {}, so the message would be lost anyway in
    // production; keep it, redacted, so the development console stays useful.
    return { name: value.name, message: redactEmailsInText(value.message) }
  }
  if (Array.isArray(value)) {
    seen.add(value)
    return value.map((item) => redact(item, keyIsEmail, depth + 1, seen))
  }
  if (!isPlainObject(value)) {
    // Dates, Maps, class instances: serialised by their own rules, left alone.
    return value
  }
  seen.add(value)
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = redact(item, EMAIL_KEY.test(key), depth + 1, seen)
  }
  return out
}

/** A copy of `value` with every email address masked. Never mutates the input. */
export function redactLogValue<T>(value: T): T {
  return redact(value, false, 0, new WeakSet()) as T
}
