/**
 * Posts one payload to a Discord webhook URL.
 *
 * Extracted from `lib/reliability-alerts.ts` so the feedback route, the reliability
 * alerts and anything else that talks to a Discord channel share one sender. Throws on
 * a non-2xx response with the status and Discord's body in the message; callers decide
 * whether that is fatal (alerts) or a logged fire-and-forget (feedback).
 */
export async function sendDiscordEmbed(webhookUrl: string, payload: object): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Discord webhook failed with HTTP ${response.status}: ${text}`)
  }
}

/** The webhook URL with `suffix` appended to its path; query parameters such as `thread_id` are kept. */
function webhookUrlWith(webhookUrl: string, suffix = '', params: Record<string, string> = {}): string {
  const url = new URL(webhookUrl)
  url.pathname = url.pathname.replace(/\/+$/, '') + suffix
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

/**
 * Posts like `sendDiscordEmbed`, but with `?wait=true` so Discord answers with the
 * created message, and returns its id (null if Discord sends none back). The id is what
 * `deleteDiscordWebhookMessage` needs to remove the message later.
 */
export async function postDiscordWebhookMessage(webhookUrl: string, payload: object): Promise<string | null> {
  const response = await fetch(webhookUrlWith(webhookUrl, '', { wait: 'true' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Discord webhook failed with HTTP ${response.status}: ${text}`)
  }

  const body = (await response.json().catch(() => null)) as { id?: unknown } | null
  return typeof body?.id === 'string' ? body.id : null
}

/**
 * Deletes a message this webhook posted. A 404 counts as done: the message is already
 * gone (deleted by hand in Discord, or by an earlier run).
 */
export async function deleteDiscordWebhookMessage(webhookUrl: string, messageId: string): Promise<void> {
  const response = await fetch(webhookUrlWith(webhookUrl, `/messages/${encodeURIComponent(messageId)}`), {
    method: 'DELETE',
  })

  if (response.ok || response.status === 404) return
  const text = await response.text().catch(() => '')
  throw new Error(`Discord webhook message delete failed with HTTP ${response.status}: ${text}`)
}
