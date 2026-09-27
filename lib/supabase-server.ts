/**
 * Server-side Supabase helpers for use in Next.js API routes.
 * Uses the REST Broadcast API — stateless, no persistent WebSocket from the server.
 */

import { prisma } from '@/lib/db'
import { buildLobbyTopic } from '@/lib/lobby-realtime-topic'
import { buildUserTopic, sealRealtimeMessage } from '@/lib/server/realtime-signing'

const BROADCAST_TIMEOUT_MS = 3000

async function broadcastToChannel(
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return false

  // Every server broadcast is signed (GHSA-g868-9224-wr3p): receivers drop
  // anything on these topics that the server did not seal, which is what stops
  // a player who holds the topic from forging the server's events. With no key
  // to sign with there is nothing a receiver would accept, so send nothing.
  let envelope: ReturnType<typeof sealRealtimeMessage>
  try {
    envelope = sealRealtimeMessage(topic, event, payload)
  } catch {
    return false
  }
  if (!envelope) return false

  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload: envelope }],
      }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Broadcast an event to all subscribers on a lobby channel.
 *
 * The topic name carries the lobby's realtime secret (#845), which is why this
 * reads the lobby rather than composing the name from the code alone. Callers
 * are unchanged: they still pass the code, and a lobby that no longer exists
 * simply broadcasts nothing, which is what used to happen anyway once every
 * subscriber had left.
 */
export async function broadcastToLobby(
  lobbyCode: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  // Broadcasting is fire-and-forget at almost every call site, so this must
  // behave the way it did before it touched the database: fail quietly and
  // return false, never reject into an unhandled promise.
  let lobby: { realtimeSecret: string } | null = null
  try {
    lobby = await prisma.lobbies.findUnique({
      where: { code: lobbyCode },
      select: { realtimeSecret: true },
    })
  } catch {
    return false
  }
  if (!lobby) return false

  return broadcastToChannel(buildLobbyTopic(lobbyCode, lobby.realtimeSecret), event, payload)
}

/**
 * Broadcast an event to one user's channel. The topic is `user:{userId}:{tag}`
 * (`buildUserTopic`), not the guessable `user:{userId}` it used to be (audit
 * S3-05); the user fetches it from GET /api/realtime/user-topic.
 */
export async function broadcastToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  let topic: string | null
  try {
    topic = buildUserTopic(userId)
  } catch {
    return false
  }
  if (!topic) return false
  return broadcastToChannel(topic, event, payload)
}
