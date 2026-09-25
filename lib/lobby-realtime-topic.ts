/**
 * Names the Supabase Realtime broadcast topic a lobby talks on.
 *
 * The topic used to be `lobby:{code}`, and lobby codes are four digits, so
 * anyone could subscribe to any lobby by enumerating ten thousand names. Two
 * things rode on that: Alias broadcasts guess text client-to-client, so it never
 * passes through a server that could withhold it, and a lobby with
 * `allowSpectators: false` refused outsiders over HTTP while its game state
 * still went out on the open topic (#845).
 *
 * The name now carries a random per-lobby secret. Enumerating codes buys
 * nothing: the secret is handed out by GET /api/lobby/[code]/realtime-topic,
 * which applies the same membership check as the rest of the lobby API, and,
 * inside the topic string, by the spectate route to admitted spectators. Since
 * migration 20260924141000 the API roles cannot select the column, so neither
 * PostgREST nor Postgres Changes leaks it (audit 2026-09-24).
 *
 * Both sides build the name here so they cannot drift apart — a mismatch would
 * not raise an error, it would just silently deliver nothing.
 */

export function buildLobbyTopic(code: string, realtimeSecret: string): string {
  return `lobby:${code}:${realtimeSecret}`
}

/**
 * The spectate page's own topic: presence (who is watching) and spectator
 * chat, both client to client. It used to be `spectators:{code}`, which anyone
 * could join for any four-digit code to post into a lobby's spectator chat or
 * inflate its viewer count (audit S3-07). It now carries the lobby's secret,
 * which spectators already receive inside the lobby topic from the spectate
 * route, so the set of people who can reach it is the set who can already
 * watch the game.
 */
export function buildSpectatorTopic(code: string, realtimeSecret: string): string {
  return `spectators:${code}:${realtimeSecret}`
}

/** The spectator topic that belongs to a lobby topic, or null if `lobbyTopic` is not one. */
export function spectatorTopicFor(lobbyTopic: string): string | null {
  const match = /^lobby:([^:]+):(.+)$/.exec(lobbyTopic)
  return match ? buildSpectatorTopic(match[1], match[2]) : null
}
