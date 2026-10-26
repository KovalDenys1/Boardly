/**
 * Which authoritative snapshot is allowed to replace the one on screen (#985).
 *
 * A game page has three sources of state and they do not arrive in order: the
 * response to the player's own move, a realtime broadcast, and whatever an
 * already-in-flight lobby poll happens to carry. Nothing compared them, so a
 * snapshot taken *before* the player moved could land on top of the optimistic
 * board — the move vanished, then the real state arrived and it came back. That
 * is the flicker players reported.
 *
 * The comparable value is `lastMoveAt`, which every engine stamps when it
 * processes a move. Two rules keep the comparison honest:
 *
 * - Only *server* snapshots update the watermark. An optimistic state is
 *   stamped with the client's clock, and a client running a few seconds fast
 *   would otherwise reject every real state that followed and freeze the board.
 * - The player's own move response is trusted, and it is what unsticks the
 *   board if the watermark ever gets ahead – unless a snapshot newer than it
 *   landed while it was in flight.
 *
 * A snapshot with no `lastMoveAt` cannot be judged, so it is accepted; the
 * in-flight guard below is what protects that case.
 */

export interface FreshnessWatermark {
  /** The `lastMoveAt` of the newest server snapshot applied so far, or null before the first. */
  current: number | null
  /** The state's own `updatedAt` beside `current`; it breaks a tie on `lastMoveAt` when both sides carry it. */
  updatedAt?: number | null
  /** `current` came from a snapshot taken while a move was in flight, so that move's own answer may be older. */
  overtookMove?: boolean
  /** A snapshot newer than the board was dropped for a move in flight, so the page reads again once it settles. */
  missedDuringMove?: boolean
  /** How many lobby reads the page has sent; each is numbered as it leaves (#1528). */
  readsSent?: number
  /** The newest read whose board was applied: a read behind it gives nothing. */
  boardRead?: ReadPlace
  /** The newest read whose lobby facts are on screen: a read behind it brings none, and only a reconcile still brings its board. */
  lobbyRead?: ReadPlace
  /** Players a frame or a read reported gone. */
  departed?: Record<string, Departure>
  /** The host the newest player-left frame handed the lobby to, and that frame's leave time. */
  frameHost?: string
  frameHostAt?: number
}

/** Where a read stands: its game-state age first; its number orders only reads that are as old. */
export interface ReadPlace {
  read: number
  lastMoveAt: number | null
  updatedAt: number | null
  gameId?: string
}

/** When a player left by the server's clock, if known, and how many reads had been sent when the page learned it. */
export interface Departure {
  at?: number
  read: number
}

export function createFreshnessWatermark(): FreshnessWatermark {
  return { current: null }
}

export function readLastMoveAt(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { lastMoveAt?: unknown }).lastMoveAt
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readUpdatedAt(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { updatedAt?: unknown }).updatedAt
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value
  return typeof time === 'number' && Number.isFinite(time) ? time : null
}

function ageAgainst(watermark: FreshnessWatermark, lastMoveAt: number, updatedAt: number | null): 'older' | 'same' | 'newer' {
  if (watermark.current === null) return 'newer'
  if (lastMoveAt !== watermark.current) return lastMoveAt < watermark.current ? 'older' : 'newer'
  const mark = watermark.updatedAt ?? null
  if (updatedAt === null || mark === null || updatedAt === mark) return 'same'
  return updatedAt < mark ? 'older' : 'newer'
}

export interface FreshnessDecision {
  /** Whether the caller should apply this snapshot. */
  accept: boolean
  /** Why it was rejected, for the log line. */
  reason?: 'older-than-applied' | 'move-in-flight' | 'superseded-read'
  /** For a numbered read: no read sent after it has put its lobby facts (host, roster, settings) on screen. */
  lobby?: boolean
  /** A read dropped for its place that is of the game on screen: its host may still replace a host on screen who has left. */
  hostOnly?: boolean
}

/**
 * Numbers a lobby read as it leaves (#1528). Two reads can carry the same game
 * state and still differ in what the stamps cannot see – a leave sweeps a seat
 * and moves the host without restamping – so only the order they were sent in
 * tells which is newer. Pass the number to `decideFreshness` when it lands.
 */
export function beginLobbyRead(watermark: FreshnessWatermark): number {
  watermark.readsSent = (watermark.readsSent ?? 0) + 1
  return watermark.readsSent
}

function readTime(value: unknown): number | undefined {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value
  return typeof time === 'number' && Number.isFinite(time) ? time : undefined
}

function noteDeparted(watermark: FreshnessWatermark, userId: string, at: number | undefined): void {
  const departed = (watermark.departed ??= {})
  const known = departed[userId]
  if (known && (at === undefined || (known.at !== undefined && at <= known.at))) return
  departed[userId] = { at, read: watermark.readsSent ?? 0 }
}

/** Whether `host` may be shown as host: nobody reported them gone, or `read` was sent after the page learned it and names them, so they came back. */
function isLiveHost(watermark: FreshnessWatermark, host: unknown, read?: number): host is string {
  if (typeof host !== 'string' || host.length === 0) return false
  const gone = watermark.departed?.[host]
  return gone === undefined || (read !== undefined && read > gone.read)
}

/**
 * A player-left frame (#1528). Records the player who left, and returns the host
 * the frame hands the lobby to, or null. A frame carries the server's leave
 * time, and the host only changes when the host leaves, so a frame is refused
 * when it is older than the newest one taken, or names a host who left after
 * it – the older of two leaves whose frames arrived newest first. A host who
 * left before it was in the room again when the server chose them. A frame
 * without a time is refused whenever its host has been reported gone.
 */
export function takePlayerLeftFrame(
  watermark: FreshnessWatermark,
  frame: { userId?: unknown; nextCreatorId?: unknown; leftAt?: unknown }
): string | null {
  const at = readTime(frame.leftAt)
  if (typeof frame.userId === 'string' && frame.userId.length > 0) noteDeparted(watermark, frame.userId, at)
  const next = frame.nextCreatorId
  if (typeof next !== 'string' || next.length === 0) return null
  if (at !== undefined && watermark.frameHostAt !== undefined && at < watermark.frameHostAt) return null
  const gone = watermark.departed?.[next]
  if (gone && (at === undefined || (gone.at !== undefined && gone.at > at))) return null
  if (gone) delete watermark.departed?.[next]
  watermark.frameHost = next
  if (at !== undefined) watermark.frameHostAt = at
  return next
}

/**
 * The lobby to show once read number `read` lands, given the decision on it and
 * the lobby on screen. A read whose lobby facts are older than the ones on
 * screen keeps the lobby on screen; and no read puts back a host who has left –
 * it keeps the host on screen, or the one the newest frame named.
 */
export function lobbyFromRead<L extends { creatorId?: string | null }>(
  watermark: FreshnessWatermark,
  decision: FreshnessDecision,
  read: number,
  incoming: L | null,
  onScreen: L | null
): L | null {
  const superseded = decision.reason === 'superseded-read'
  const base = superseded || (decision.lobby === false && onScreen) ? onScreen : incoming
  if (!base || base.creatorId == null || isLiveHost(watermark, base.creatorId, base === incoming ? read : undefined)) return base
  let host: string | undefined
  if (base === incoming) host = [onScreen?.creatorId, watermark.frameHost].find((candidate) => isLiveHost(watermark, candidate))
  else if (isLiveHost(watermark, watermark.frameHost)) host = watermark.frameHost
  else if ((!superseded || decision.hostOnly) && isLiveHost(watermark, incoming?.creatorId, read)) host = incoming?.creatorId ?? undefined
  return host ? { ...base, creatorId: host } : base
}

/** A reconcile whose lobby facts are older than the ones on screen brings its board, never its roster. */
export function rosterForRead<G extends { id: string; players?: unknown }>(
  incoming: G | null,
  onScreen: G | null,
  decision: FreshnessDecision
): G | null {
  if (decision.lobby !== false || !incoming || !onScreen || onScreen.id !== incoming.id) return incoming
  return { ...incoming, players: onScreen.players }
}

/** A roster row with `leftAt` is a departure; one with `leftAt: null` in a read sent after the page learned of it is a return. */
function noteRoster(watermark: FreshnessWatermark, roster: unknown, read: number, departuresOnly = false): void {
  if (!Array.isArray(roster)) return
  for (const row of roster) {
    const userId = (row as { userId?: unknown } | null)?.userId
    if (typeof userId !== 'string' || userId.length === 0) continue
    const leftAt = (row as { leftAt?: unknown }).leftAt
    if (leftAt) noteDeparted(watermark, userId, readTime(leftAt))
    else if (!departuresOnly && leftAt === null && (watermark.departed?.[userId]?.read ?? read) < read) delete watermark.departed?.[userId]
  }
}

function compareAge(
  a: { lastMoveAt: number | null; updatedAt: number | null },
  b: { lastMoveAt: number | null; updatedAt: number | null }
): 'older' | 'same' | 'newer' {
  if (a.lastMoveAt === null || b.lastMoveAt === null) return 'same'
  if (a.lastMoveAt !== b.lastMoveAt) return a.lastMoveAt < b.lastMoveAt ? 'older' : 'newer'
  if (a.updatedAt === null || b.updatedAt === null || a.updatedAt === b.updatedAt) return 'same'
  return a.updatedAt < b.updatedAt ? 'older' : 'newer'
}

/** Whether `place` stands behind, level with or ahead of `mark`: by game-state age, and by send order when the ages match. */
function placeAgainst(place: ReadPlace, mark: ReadPlace | undefined): 'older' | 'same' | 'newer' {
  if (!mark) return 'newer'
  const byAge = compareAge(place, mark)
  if (byAge !== 'same') return byAge
  return place.read === mark.read ? 'same' : place.read < mark.read ? 'older' : 'newer'
}

/**
 * How far ahead of this client's clock an unsolicited snapshot's `lastMoveAt`
 * may be and still move the watermark (GHSA-g868-9224-wr3p).
 *
 * The watermark only ever goes up, so one snapshot stamped far in the future
 * would make every real one after it look "older" and be dropped until the
 * player's own next move. Broadcasts are signed by the server now, so such a
 * snapshot should not arrive at all; this keeps the damage bounded if one
 * ever does. A snapshot beyond the lead is still applied – a device whose
 * clock is minutes slow sees every genuine stamp as "future", and freezing its
 * board would be worse – it just does not raise the bar for the next one.
 */
export const MAX_WATERMARK_LEAD_MS = 60 * 1000

/**
 * `trusted` is the response to a move this client just submitted; it wins unless a snapshot newer than it landed during its flight.
 * `moveInFlight` is true between optimistic apply and that response — during
 * that window an unsolicited snapshot cannot have seen the move, so it is
 * dropped rather than compared.
 * `snapshot` is a lobby read: its equal stamp may carry an unstamped timeout or sweep, unless a move is in flight on that board.
 * `read` is that read's number from `beginLobbyRead`. Reads are placed by game-state
 * age, and by the order they left only when their ages match: a strictly newer
 * board always applies, whenever its read left. A read placed behind the newest
 * one whose board was applied gives nothing, a reconcile included; one placed
 * behind the newest one whose lobby facts are on screen gives nothing either,
 * unless it is a reconcile: that one has its board judged as usual and
 * `lobby: false`. An older snapshot (`snapshot` and `older-than-applied`) puts
 * no lobby facts on screen, so it moves no mark.
 * `roster` is the read's player rows; only a read that keeps its place teaches the page who left,
 * or one dropped for its place that is of the game on screen (`gameId`): a leave after the game
 * ended writes no game state, so the reads on either side of it are as old, and the one that left
 * first can be the one answered after it. A read stamped beyond MAX_WATERMARK_LEAD_MS is placed by
 * its send order alone, so it cannot put every read after it behind.
 */
export function decideFreshness(
  watermark: FreshnessWatermark,
  incoming: unknown,
  options?: { trusted?: boolean; moveInFlight?: boolean; snapshot?: boolean; read?: number; roster?: unknown; gameId?: unknown; now?: number }
): FreshnessDecision {
  const read = options?.read
  if (read === undefined) return judgeBoard(watermark, incoming, options)
  const gameId = typeof options?.gameId === 'string' && options.gameId.length > 0 ? options.gameId : undefined
  const place: ReadPlace = { read, lastMoveAt: readLastMoveAt(incoming), updatedAt: readUpdatedAt(incoming), gameId }
  const behindBoard = placeAgainst(place, watermark.boardRead) === 'older'
  const behindLobby = placeAgainst(place, watermark.lobbyRead) === 'older'
  if (behindLobby && (behindBoard || !options?.trusted)) {
    const ofGameOnScreen = gameId !== undefined && gameId === watermark.boardRead?.gameId
    if (ofGameOnScreen) noteRoster(watermark, options?.roster, read, true)
    return { accept: false, reason: 'superseded-read', lobby: false, ...(ofGameOnScreen ? { hostOnly: true } : {}) }
  }
  noteRoster(watermark, options?.roster, read)
  const decision: FreshnessDecision = behindBoard ? { accept: false, reason: 'older-than-applied' } : judgeBoard(watermark, incoming, options)
  const lobby = !behindLobby
  const beyondLead = place.lastMoveAt !== null && place.lastMoveAt > (options?.now ?? Date.now()) + MAX_WATERMARK_LEAD_MS
  const mark: ReadPlace = beyondLead ? { read, lastMoveAt: null, updatedAt: null, gameId } : place
  if (lobby && !(options?.snapshot && decision.reason === 'older-than-applied')) watermark.lobbyRead = mark
  if (decision.accept) watermark.boardRead = mark
  return { ...decision, lobby }
}

function judgeBoard(
  watermark: FreshnessWatermark,
  incoming: unknown,
  options?: { trusted?: boolean; moveInFlight?: boolean; snapshot?: boolean; now?: number }
): FreshnessDecision {
  const incomingLastMoveAt = readLastMoveAt(incoming)
  const incomingUpdatedAt = readUpdatedAt(incoming)
  const age = incomingLastMoveAt === null ? null : ageAgainst(watermark, incomingLastMoveAt, incomingUpdatedAt)

  if (options?.trusted) {
    const overtaken = watermark.overtookMove === true && age === 'older'
    watermark.overtookMove = false
    if (overtaken) return { accept: false, reason: 'older-than-applied' }
    if (incomingLastMoveAt !== null) {
      watermark.current = incomingLastMoveAt
      watermark.updatedAt = incomingUpdatedAt
    }
    return { accept: true }
  }

  if (options?.moveInFlight && !options?.snapshot) {
    if (age !== 'older' && age !== 'same') watermark.missedDuringMove = true
    return { accept: false, reason: 'move-in-flight' }
  }

  if (incomingLastMoveAt === null) return { accept: true }

  if (age === 'older') return { accept: false, reason: 'older-than-applied' }
  if (age === 'same') {
    // Strictly newer: a rebroadcast of the state the board already shows carries
    // the same stamp and must not re-render over an optimistic move.
    if (!options?.snapshot) return { accept: false, reason: 'older-than-applied' }
    if (options?.moveInFlight) return { accept: false, reason: 'move-in-flight' }
    watermark.updatedAt = watermark.updatedAt ?? incomingUpdatedAt
    watermark.overtookMove = false
    return { accept: true }
  }

  const now = options?.now ?? Date.now()
  if (incomingLastMoveAt <= now + MAX_WATERMARK_LEAD_MS) {
    watermark.current = incomingLastMoveAt
    watermark.updatedAt = incomingUpdatedAt
    watermark.overtookMove = options?.moveInFlight === true
  }
  return { accept: true }
}

/** Whether a newer snapshot was dropped for the move that just settled; asking clears it. */
export function takeMissedSnapshot(watermark: FreshnessWatermark): boolean {
  const missed = watermark.missedDuringMove === true
  watermark.missedDuringMove = false
  return missed
}

/** A rematch or a returned-to-waiting lobby starts a new series; the old watermark must not block it. */
export function resetFreshnessWatermark(watermark: FreshnessWatermark): void {
  watermark.current = null
  watermark.updatedAt = null
  watermark.overtookMove = false
  watermark.missedDuringMove = false
  watermark.departed = {}
  watermark.frameHost = undefined
  watermark.frameHostAt = undefined
}

/**
 * The game a snapshot belongs to, when it says so. A rematch is a new row with
 * a new id, and its state must neither be written into the game on screen nor
 * move that game's watermark (#994).
 */
export function readGameStateId(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as { id?: unknown }).id
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Whether a game-update broadcast belongs to a different game row than the one
 * on screen – a rematch – and must be dropped (#994).
 *
 * Judged only by the `gameId` the server puts on the broadcast, never by the
 * state's own `id`: engines are created with `game_${Date.now()}` in
 * POST /api/game/create, so that id never equals the row id. Comparing the two
 * dropped every broadcast for Memory, Yahtzee and Spy from 18.09 (#1160). An
 * untagged update is accepted, as it was before #994.
 */
export function isUpdateForAnotherGame(update: unknown, currentGameId: string): boolean {
  if (!update || typeof update !== 'object') return false
  const tagged = (update as { gameId?: unknown }).gameId
  return typeof tagged === 'string' && tagged.length > 0 && tagged !== currentGameId
}

const LIFECYCLE_ORDER = ['waiting', 'playing', 'finished'] as const
export type LifecycleStatus = (typeof LIFECYCLE_ORDER)[number]

/**
 * The game row's lifecycle status after seeing `incoming`, moving only forward
 * (waiting → playing → finished) (#1183).
 *
 * The watermark judges the board, not the lifecycle. When the start broadcast
 * was applied first, every later snapshot carrying `status: 'playing'` had the
 * same `lastMoveAt` and was rejected as stale, so a non-host sat on "Waiting
 * for host to start" until they reloaded. A forward step cannot rewind
 * anything, so it is safe to take even from a snapshot whose board is dropped.
 */
export function advanceLifecycleStatus<T extends string>(current: T, incoming: unknown): T | LifecycleStatus {
  const currentRank = LIFECYCLE_ORDER.indexOf(current as LifecycleStatus)
  const incomingRank = LIFECYCLE_ORDER.indexOf(incoming as LifecycleStatus)
  if (currentRank === -1 || incomingRank === -1 || incomingRank <= currentRank) return current
  return LIFECYCLE_ORDER[incomingRank]
}

/** Only a snapshot dropped as old as the board, for the move in flight, still brings its roster, unless a newer one is on screen; the status stays the move's own. */
export function keepBoardFromDroppedSnapshot<G extends { id: string; status: string; players?: unknown }>(
  current: G | null,
  dropped: { id?: unknown; status?: unknown; players?: unknown } | null | undefined,
  decision: FreshnessDecision
): G | null {
  if (decision.reason !== 'move-in-flight' || decision.lobby === false || !current || !dropped || dropped.id !== current.id) return current
  return dropped.players !== undefined ? { ...current, players: dropped.players } : current
}
