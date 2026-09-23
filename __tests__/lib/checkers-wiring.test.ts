/**
 * #1083. Every registry a new game has to be added to, checked for Checkers in
 * one place – the per-registry suites predate the game and name their games by
 * hand, so this file is what fails when one of the "Adding a new game" steps is
 * skipped.
 */
import { readFileSync } from 'fs'
import path from 'path'
import { createGameEngine, getGameMetadata as getRegistryMetadata, hasBotSupport, restoreGameEngine } from '@/lib/game-registry'
import { getCatalogEntryById, getGameMetadata, isFlagPromotableEntry } from '@/lib/game-catalog'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { resolveDedicatedLobbyPageGameType } from '@/lib/lobby-page-routing'
import { getGameLobbiesRoute } from '@/lib/public-game-access'
import { toAnalyticsGameType } from '@/lib/analytics-game-types'
import { getBotDisplayName } from '@/lib/bot-profiles'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'
import { createBot } from '@/lib/bots/core/bot-factory'
import { isBotPacedGameType } from '@/lib/bots/core/bot-turn-pace'
import { CheckersGame } from '@/lib/games/checkers-game'
import { CheckersBot } from '@/lib/bots/checkers/checkers-bot'
import { GAME_GLYPHS } from '@/components/GameIcon'

describe('Checkers wiring (#1083)', () => {
  it('is registered as a two-player, bot-capable, turn-index game', () => {
    const engine = createGameEngine('checkers', 'ck-1')
    expect(engine).toBeInstanceOf(CheckersGame)
    expect(engine.getState().gameType).toBe('checkers')
    expect(getRegistryMetadata('checkers')).toMatchObject({ minPlayers: 2, maxPlayers: 2, supportsBots: true })
    expect(hasBotSupport('checkers')).toBe(true)
    expect(getGameMetadata('checkers')).toMatchObject({ svgId: 'checkers', usesTurnIndex: true, supportsBots: true })

    const restored = restoreGameEngine('checkers', 'ck-1', engine.getState())
    expect(restored).toBeInstanceOf(CheckersGame)
  })

  it('restores on the client', async () => {
    const engine = await restoreGameEngineClient('checkers', 'ck-2', { players: [], status: 'waiting' })
    expect(engine).toBeInstanceOf(CheckersGame)
  })

  it('has a dedicated lobby page once it starts, and a lobbies route', () => {
    expect(resolveDedicatedLobbyPageGameType('checkers', 'waiting')).toBeNull()
    expect(resolveDedicatedLobbyPageGameType('checkers', 'playing')).toBe('checkers')
    expect(resolveDedicatedLobbyPageGameType('checkers', 'finished')).toBe('checkers')
    expect(getGameLobbiesRoute('checkers')).toBe('/games/checkers/lobbies')
  })

  it('is in-development in the catalog, with everything the flag needs to promote it', () => {
    const entry = getCatalogEntryById('checkers')
    expect(entry?.availability).toBe('in-development')
    expect(entry && isFlagPromotableEntry(entry)).toBe(true)
    expect(entry?.route).toBe('/games/checkers/lobbies')
    expect(entry?.lobbyCreateConfig?.allowedPlayers).toEqual([2])
    expect(entry?.seo?.questionKey).toBe('games.checkers.seo.question')
  })

  it('is known to analytics, bot names, the broadcast sanitizer and the bot pace table', () => {
    expect(toAnalyticsGameType('checkers')).toBe('checkers')
    expect(getBotDisplayName('checkers', 'easy')).toBe('Checkers Rookie')
    expect(getBotDisplayName('checkers', 'hard')).toBe('Kingmaker')
    expect(isBotPacedGameType('checkers')).toBe(true)
    const state = { status: 'playing', data: { board: [[0]] } }
    expect(sanitizeStateForBroadcast('checkers', state)).toEqual(state)
  })

  it('creates its bot through the factory', () => {
    const engine = new CheckersGame('ck-3')
    expect(createBot('checkers', engine, 'hard')).toBeInstanceOf(CheckersBot)
  })

  it('has its own glyph, a GameType enum value and a migration adding it', () => {
    expect(GAME_GLYPHS.checkers).toBeDefined()
    const root = path.resolve(__dirname, '..', '..')
    const schema = readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8')
    expect(schema).toMatch(/enum GameType \{[^}]*\bcheckers\b[^}]*\}/)
    const migration = readFileSync(
      path.join(root, 'prisma', 'migrations', '20260924000000_add_checkers_game_type', 'migration.sql'),
      'utf8'
    )
    expect(migration.trim()).toBe(`ALTER TYPE "GameType" ADD VALUE 'checkers';`)
  })
})
