/**
 * Server-side Supabase helpers for use in Next.js API routes.
 * Uses the REST Broadcast API — stateless, no persistent WebSocket from the server.
 */

const BROADCAST_TIMEOUT_MS = 3000

async function broadcastToChannel(
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return false

  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload }],
      }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Broadcast an event to all subscribers on a lobby channel (`lobby:{code}`). */
export async function broadcastToLobby(
  lobbyCode: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  return broadcastToChannel(`lobby:${lobbyCode}`, event, payload)
}

/** Broadcast an event to a specific user's channel (`user:{userId}`). */
export async function broadcastToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  return broadcastToChannel(`user:${userId}`, event, payload)
}
