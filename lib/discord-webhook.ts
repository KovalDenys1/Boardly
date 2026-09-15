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
