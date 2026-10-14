/**
 * Plays each bot-capable board game bot against bot and writes the snapshots a
 * real game would store, as __tests__/fixtures/replays/<game>.json. Re-run when
 * an engine changes what it records, naming the games to rewrite (none = all):
 *
 *   BOT_UX_DELAY_MS=0 npx tsx scripts/generate-replay-fixtures.ts memory
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { executeBotTurn } from '@/lib/bots/core/bot-factory'
import type { GameEngine, Move } from '@/lib/game-engine'
import { CheckersGame } from '@/lib/games/checkers-game'
import { ConnectFourGame } from '@/lib/games/connect-four-game'
import { LudoGame } from '@/lib/games/ludo-game'
import { MemoryGame } from '@/lib/games/memory-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import type { RegisteredGameType } from '@/lib/game-registry'
import { sanitizeReplayState } from '@/lib/replay/sanitize-replay-state'
import type { ReplayPlayer, ReplaySnapshotInput } from '@/lib/replay/types'

const OUT_DIR = join(process.cwd(), '__tests__', 'fixtures', 'replays')
const MAX_MOVES = 400

const GAMES: Array<{ type: RegisteredGameType; make: () => GameEngine }> = [
  { type: 'tic_tac_toe', make: () => new TicTacToeGame('fixture-ttt') },
  { type: 'connect_four', make: () => new ConnectFourGame('fixture-c4') },
  { type: 'checkers', make: () => new CheckersGame('fixture-checkers') },
  { type: 'ludo', make: () => new LudoGame('fixture-ludo') },
  { type: 'memory', make: () => new MemoryGame('fixture-memory') },
]

const PLAYERS: ReplayPlayer[] = [
  { userId: 'player-ada', name: 'Ada', isBot: false, seat: 0 },
  { userId: 'player-bot', name: 'Robo', isBot: true, seat: 1 },
]

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

async function play(type: RegisteredGameType, engine: GameEngine): Promise<ReplaySnapshotInput[]> {
  for (const player of PLAYERS) engine.addPlayer({ id: player.userId, name: player.name })
  engine.startGame()

  const snapshots: ReplaySnapshotInput[] = []
  let turn = 0
  const record = (actionType: string, playerId: string | null, payload: unknown) => {
    snapshots.push({
      id: `${type}-${snapshots.length}`,
      turnNumber: turn,
      playerId,
      actionType,
      actionPayload: payload ?? null,
      state: sanitizeReplayState(type, clone(engine.getState())),
      createdAt: new Date(Date.UTC(2026, 9, 13, 10, 0, snapshots.length)).toISOString(),
    })
  }
  record('game:start', null, null)

  while (engine.getState().status === 'playing' && snapshots.length < MAX_MOVES) {
    const actor = engine.getCurrentPlayer()
    if (!actor) break
    const isBot = PLAYERS.find((p) => p.userId === actor.id)?.isBot ?? false
    const before = snapshots.length
    await executeBotTurn(type, engine, actor.id, 'easy', async (move: Move) => {
      if (!engine.makeMove(move)) throw new Error(`${type}: move rejected ${JSON.stringify(move)}`)
      turn += 1
      record(isBot ? `bot:${move.type}` : move.type, move.playerId, move.data)
    })
    if (snapshots.length === before) throw new Error(`${type}: the bot made no move`)
  }
  return snapshots
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const only = process.argv.slice(2)
  for (const { type, make } of GAMES.filter((game) => only.length === 0 || only.includes(game.type))) {
    const snapshots = await play(type, make())
    const file = join(OUT_DIR, `${type}.json`)
    writeFileSync(file, JSON.stringify({ gameType: type, players: PLAYERS, snapshots }) + '\n')
    console.log(`${type}: ${snapshots.length} snapshots, status ${(snapshots.at(-1)?.state as { status: string }).status}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
