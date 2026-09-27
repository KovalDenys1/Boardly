import { GameStatus, Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { scrubErasedPlayers, type ErasedIdentity } from '@/lib/account-erasure'
import { RETIRED_LOBBY_CODE_PREFIX } from '@/lib/lobby'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'

const log = apiLogger('game-pseudonymisation')

/**
 * What a finished game keeps once its retention period is over (#1130, decision
 * 2026-09-27: pseudonymise instead of delete).
 *
 * Kept, because the player's statistics, the leaderboard, achievements and the Control
 * Panel's analytics read them: the row and its timestamps (updatedAt included, which
 * lib/user-stats-dashboard.ts and the speed_demon achievement read as the end of the
 * game), status, game type, `Players` rows (user id, score, placement, winner),
 * `terminalMetadata` (user ids and results only), and every id inside `state`, so
 * `state->'players'` still says who sat where and how they scored.
 *
 * Replaced: every player name in `state`, with a seat label ("Player 2") for people and
 * nothing for bots, whose names are not anyone's; and what the players wrote or drew –
 * Spy questions and answers, Sketch & Guess drawings and guesses, Liar's Party claims,
 * Fake Artist strokes and Telephone Doodle prompts, captions and drawings. Replay
 * snapshots are past their own 90-day period by then (lib/cleanup-replays.ts), so any
 * that survived are deleted rather than kept in any form.
 *
 * A lobby whose games have all been pseudonymised gets the name the create route gives
 * a lobby nobody named (`Lobby <code>`) and forgets whom its host kicked.
 */

/** The label a person's name becomes, by their seat in `state.players` (1-based). */
export function seatLabel(seat: number): string {
  return `Player ${seat}`
}

const TERMINAL_GAME_STATUSES = [GameStatus.finished, GameStatus.abandoned, GameStatus.cancelled]

const OWN_ID_KEYS = ['id', 'userId', 'playerId'] as const
const OWN_NAME_KEYS = ['name', 'username', 'userName', 'playerName', 'displayName'] as const

type JsonObject = Record<string, unknown>

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addName(names: Map<string, Set<string>>, id: string, name: string) {
  if (name.length === 0) return
  let set = names.get(id)
  if (!set) {
    set = new Set()
    names.set(id, set)
  }
  set.add(name)
}

/**
 * Every name the stored JSON ties to a player id: `{ id, name }` objects whose id is a
 * known player, and `<x>Id` / `<x>Name` pairs (Spy's askerId/askerName, Yahtzee's
 * playerId/playerName) whatever the id, which is how a player who left mid-game – gone
 * from `state.players`, still in the move log – is found too.
 */
export function collectPlayerNames(value: unknown, knownIds: ReadonlySet<string>): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>()

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!isPlainObject(node)) return

    const ownId = OWN_ID_KEYS.map((key) => node[key]).find((id): id is string => typeof id === 'string')
    if (ownId !== undefined && knownIds.has(ownId)) {
      for (const key of OWN_NAME_KEYS) {
        const name = node[key]
        if (typeof name === 'string') addName(names, ownId, name)
      }
    }

    for (const [key, id] of Object.entries(node)) {
      if (key.length > 2 && key.endsWith('Id') && typeof id === 'string') {
        const name = node[`${key.slice(0, -2)}Name`]
        if (typeof name === 'string') addName(names, id, name)
      }
    }

    Object.values(node).forEach(walk)
  }

  walk(value)
  return names
}

/** Empties `key` on every object in `items` that holds a string there. */
function blankStrings(items: unknown, key: string) {
  if (!Array.isArray(items)) return
  for (const item of items) {
    if (isPlainObject(item) && typeof item[key] === 'string') item[key] = ''
  }
}

/**
 * Removes what the players wrote or drew, in place, per game. The fields keep their
 * type (an empty string, or null where the engine already allows null), so every
 * reader and sanitizer that walks a finished state still finds the shape it expects.
 * Games not listed hold no free text: their state is moves, dice, cards and scores.
 */
const FREE_TEXT_STRIPPERS: Readonly<Record<string, (data: JsonObject) => void>> = {
  guess_the_spy: (data) => {
    blankStrings(data.questionHistory, 'question')
    blankStrings(data.questionHistory, 'answer')
    if (typeof data.pendingQuestion === 'string') data.pendingQuestion = null
  },
  sketch_and_guess: (data) => {
    if (!Array.isArray(data.rounds)) return
    for (const round of data.rounds) {
      if (!isPlainObject(round)) continue
      // null is what a round holds before a drawing arrives; readers already handle it
      // (content reports answer "nothing to report", the reveal shows no drawing).
      if (typeof round.drawingContent === 'string') round.drawingContent = null
      blankStrings(round.guesses, 'guess')
      // Which language each player asked their hint in: nothing a statistic needs.
      delete round.hintLocales
    }
  },
  liars_party: (data) => {
    if (isPlainObject(data.claim) && typeof data.claim.text === 'string') data.claim.text = ''
    blankStrings(data.roundResults, 'claimText')
  },
  fake_artist: (data) => {
    blankStrings(data.strokes, 'content')
  },
  telephone_doodle: (data) => {
    if (!Array.isArray(data.chains)) return
    for (const chain of data.chains) {
      if (isPlainObject(chain)) blankStrings(chain.steps, 'content')
    }
  },
}

export interface GameRosterEntry {
  userId: string
  /** The account's current name, when the account still exists. */
  username: string | null
}

export interface PseudonymiseGameInput {
  gameType: string
  state: unknown
  /** The game's Players rows. Guests purged since have none; their ids are in state. */
  players: GameRosterEntry[]
  /** Ids that belong to bots: their names are kept. */
  botIds: ReadonlySet<string>
}

export interface PseudonymisedGame {
  state: unknown
  changed: boolean
  /**
   * The state could not be read as an object, so nothing in it could be checked. The
   * caller must not mark such a game done: it may still hold names.
   */
  unparseable: boolean
  /** Person id -> the label their name became. */
  labels: Map<string, string>
}

/**
 * The pure part: a finished game's state with its people unnamed and their words
 * gone. Returns the input unchanged (changed: false) when there was nothing to do, and
 * unparseable: true when the state could not be read at all.
 */
export function pseudonymiseGameState(input: PseudonymiseGameInput): PseudonymisedGame {
  const original = input.state
  const unreadable = { state: original, changed: false, unparseable: true, labels: new Map<string, string>() }
  let parsed: unknown
  try {
    parsed = parsePersistedGameState(original as Prisma.JsonValue)
  } catch {
    return unreadable
  }
  if (!isPlainObject(parsed)) return unreadable

  // Seats first, in the order the game recorded them, so "Player 2" is the second seat.
  const seatIds: string[] = Array.isArray(parsed.players)
    ? parsed.players
        .map((player) => (isPlainObject(player) && typeof player.id === 'string' ? player.id : null))
        .filter((id): id is string => id !== null)
    : []
  const knownIds = new Set<string>([...seatIds, ...input.players.map((player) => player.userId)])
  const names = collectPlayerNames(parsed, knownIds)

  const ordered: string[] = []
  for (const id of [...seatIds, ...input.players.map((player) => player.userId), ...names.keys()]) {
    if (!ordered.includes(id)) ordered.push(id)
  }

  const liveUsername = new Map(input.players.map((player) => [player.userId, player.username]))
  const labels = new Map<string, string>()
  const identities: ErasedIdentity[] = []
  ordered.forEach((id, index) => {
    if (input.botIds.has(id)) return
    const label = seatLabel(index + 1)
    labels.set(id, label)
    const known = new Set(names.get(id) ?? [])
    const current = liveUsername.get(id)
    if (current) known.add(current)
    if (known.size === 0) {
      identities.push({ id, username: null, label })
      return
    }
    for (const name of known) identities.push({ id, username: name, label })
  })

  const scrubbed = scrubErasedPlayers(parsed, identities).value
  const next = isPlainObject(scrubbed) ? scrubbed : parsed
  const strip = FREE_TEXT_STRIPPERS[input.gameType]
  if (strip && isPlainObject(next.data)) {
    // scrubErasedPlayers shares untouched subtrees with `parsed`, which is our own copy
    // (parsePersistedGameState round-trips through JSON), so mutating here is safe.
    strip(next.data)
  }

  // `parsed` itself may have been mutated by the stripper, so compare against a fresh copy.
  const changed = JSON.stringify(next) !== JSON.stringify(parsePersistedGameState(original as Prisma.JsonValue))
  return { state: changed ? next : original, changed, unparseable: false, labels }
}

/** Finished, abandoned and cancelled games past the cutoff that still carry names. */
export function pseudonymisableGamesWhere(cutoff: Date): Prisma.GamesWhereInput {
  return {
    status: { in: TERMINAL_GAME_STATUSES },
    pseudonymisedAt: null,
    OR: [{ endedAt: { lt: cutoff } }, { endedAt: null, updatedAt: { lt: cutoff } }],
  }
}

export function countGamesToPseudonymise(cutoff: Date): Promise<number> {
  return prisma.games.count({ where: pseudonymisableGamesWhere(cutoff) })
}

export interface PseudonymiseGamesOptions {
  cutoff: Date
  now: Date
  /** Rows read per query (default 25). */
  batchSize?: number
  /** At most this many games per run; the rest wait for tomorrow's. */
  maxGames?: number
  /** Stop starting new batches after this many ms, so the cron answers in time. */
  deadlineMs?: number
}

export interface PseudonymiseGamesResult {
  pseudonymised: number
  /** Replay snapshots that had outlived their own 90-day period and went with the names. */
  snapshotsDeleted: number
  /**
   * Games whose state could not be read: logged, left unmarked, and read again by the
   * next run. Production had none on 2026-09-27 (every state was a JSON object).
   */
  skippedUnparseable: number
}

/**
 * Pseudonymises every game the rule has reached, in id order, a batch at a time. Each
 * write is guarded on the row still being unmarked and unchanged since it was read, and
 * names the old updatedAt so Prisma's @updatedAt does not move the game's end.
 */
export async function pseudonymiseGames(options: PseudonymiseGamesOptions): Promise<PseudonymiseGamesResult> {
  // Small batches: a Sketch & Guess state carries up to ten drawings of 120 KB each.
  const batchSize = options.batchSize ?? 25
  const maxGames = options.maxGames ?? 500
  const startedAt = Date.now()
  const where = pseudonymisableGamesWhere(options.cutoff)

  let pseudonymised = 0
  let snapshotsDeleted = 0
  let skippedUnparseable = 0
  let cursor: string | null = null
  let seen = 0

  while (seen < maxGames) {
    if (options.deadlineMs !== undefined && Date.now() - startedAt > options.deadlineMs) break

    const games: Array<{
      id: string
      gameType: string
      state: Prisma.JsonValue
      updatedAt: Date
      players: Array<{ userId: string; user: { username: string | null } | null }>
    }> = await prisma.games.findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      select: {
        id: true,
        gameType: true,
        state: true,
        updatedAt: true,
        players: { select: { userId: true, user: { select: { username: true } } } },
      },
      orderBy: { id: 'asc' },
      take: Math.min(batchSize, maxGames - seen),
    })
    if (games.length === 0) break
    cursor = games[games.length - 1].id
    seen += games.length

    const candidateIds = new Set<string>()
    for (const game of games) {
      game.players.forEach((player) => candidateIds.add(player.userId))
      const state = safeParse(game.state)
      if (isPlainObject(state) && Array.isArray(state.players)) {
        for (const player of state.players) {
          if (isPlainObject(player) && typeof player.id === 'string') candidateIds.add(player.id)
        }
      }
    }
    const bots = candidateIds.size
      ? await prisma.bots.findMany({ where: { userId: { in: [...candidateIds] } }, select: { userId: true } })
      : []
    const botIds = new Set(bots.map((bot) => bot.userId))

    const done: string[] = []
    for (const game of games) {
      const result = pseudonymiseGameState({
        gameType: game.gameType,
        state: game.state,
        players: game.players.map((player) => ({ userId: player.userId, username: player.user?.username ?? null })),
        botIds,
      })
      if (result.unparseable) {
        // Never marked done: an unreadable state may still hold names, and a marker would
        // hide it from every later run. The id only, never the state.
        skippedUnparseable += 1
        log.warn('Game state could not be read; left for a person to look at', { gameId: game.id })
        continue
      }
      const written = await prisma.games.updateMany({
        where: { id: game.id, updatedAt: game.updatedAt, pseudonymisedAt: null },
        data: {
          ...(result.changed ? { state: toPersistedGameStateInput(result.state) } : {}),
          pseudonymisedAt: options.now,
          updatedAt: game.updatedAt,
        },
      })
      if (written.count > 0) {
        pseudonymised += 1
        done.push(game.id)
      }
    }

    if (done.length > 0) {
      const removed = await prisma.gameStateSnapshots.deleteMany({ where: { gameId: { in: done } } })
      snapshotsDeleted += removed.count
    }
  }

  return { pseudonymised, snapshotsDeleted, skippedUnparseable }
}

function safeParse(value: Prisma.JsonValue): unknown {
  try {
    return parsePersistedGameState(value)
  } catch {
    return null
  }
}

/**
 * The lobbies the rule may rename: inactive, older than the cutoff, not yet done, that
 * held a real game (one that is not cancelled, so it started), and whose games are all
 * pseudonymised already. A lobby whose games were all cancelled is the delete rule's
 * (lib/data-retention.ts `lobbies`, abandonedLobbiesWhere).
 */
const PSEUDONYMISABLE_LOBBIES_SQL = (cutoff: Date) => Prisma.sql`
  l."isActive" = false
  AND l."createdAt" < ${cutoff}
  AND l."pseudonymisedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "Games" g WHERE g."lobbyId" = l.id AND g.status <> 'cancelled')
  AND NOT EXISTS (SELECT 1 FROM "Games" g WHERE g."lobbyId" = l.id AND g."pseudonymisedAt" IS NULL)
`

/**
 * An inactive lobby past the cutoff in which no game ever started: every game in it was
 * cancelled while waiting (or it has none). The rule deletes it with those games; the
 * rows cascade (Games, Players, GameStateSnapshots, LobbyInvites). Nothing statistics,
 * the leaderboard or achievements count as a result lives in a cancelled game.
 */
export function abandonedLobbiesWhere(cutoff: Date): Prisma.LobbiesWhereInput {
  return {
    isActive: false,
    createdAt: { lt: cutoff },
    games: { every: { status: GameStatus.cancelled } },
  }
}

export async function countLobbiesToPseudonymise(cutoff: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint | number }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM "Lobbies" l WHERE ${PSEUDONYMISABLE_LOBBIES_SQL(cutoff)}
  `)
  return Number(rows[0]?.count ?? 0)
}

/**
 * A lobby's name is whatever its creator typed, so it can name a person; it becomes the
 * name the create route gives an unnamed lobby, built from the old code. Quick Play's
 * generated name names nobody and stays. The kick list is who the host threw out, which
 * nothing needs a year later.
 *
 * The code is retired: it becomes `~<lobby id>`, so the four-digit code (10,000 of them)
 * goes back to the generator instead of being held by a lobby nobody can use. Postgres
 * evaluates every SET expression against the row as it was, so the name is built from
 * the old code even though the same statement replaces it. Only the history chip and the
 * data export ever show a retired lobby's code; /api/user/games hides it.
 */
export async function pseudonymiseLobbies(cutoff: Date, now: Date): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "Lobbies" l
    SET name = CASE WHEN l.name = 'Quick Play ' || l.code THEN l.name ELSE 'Lobby ' || l.code END,
        code = ${RETIRED_LOBBY_CODE_PREFIX}::text || l.id,
        "kickedUserIds" = ARRAY[]::text[],
        "pseudonymisedAt" = ${now}
    WHERE ${PSEUDONYMISABLE_LOBBIES_SQL(cutoff)}
  `)
}
