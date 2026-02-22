import { writeFileSync } from 'node:fs'
import { createGameEngine } from '../lib/game-registry'
import { prisma } from '../lib/db'

type LoadGameType = 'tic_tac_toe' | 'rock_paper_scissors' | 'yahtzee'

interface ScriptOptions {
  baseUrl: string
  iterations: number
  concurrency: number
  gameType: LoadGameType
  reportPath?: string
}

interface StepObservation {
  step: string
  success: boolean
  durationMs: number
  statusCode: number
  error?: string
}

interface ScenarioResult {
  success: boolean
  expectedAutoBot: boolean
  autoBotAdded: boolean
  observations: StepObservation[]
}

interface ApiCallResult<T> {
  ok: boolean
  statusCode: number
  durationMs: number
  body: T | null
  errorText?: string
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const item = process.argv.find((arg) => arg.startsWith(prefix))
  return item ? item.slice(prefix.length) : undefined
}

function parseOptions(): ScriptOptions {
  const baseUrl = readArg('base-url') || process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000'
  const iterationsRaw = Number(readArg('iterations') || process.env.LOAD_TEST_ITERATIONS || 40)
  const concurrencyRaw = Number(readArg('concurrency') || process.env.LOAD_TEST_CONCURRENCY || 8)
  const gameTypeRaw = (readArg('game-type') || process.env.LOAD_TEST_GAME_TYPE || 'tic_tac_toe') as LoadGameType

  const gameType: LoadGameType =
    gameTypeRaw === 'tic_tac_toe' || gameTypeRaw === 'rock_paper_scissors' || gameTypeRaw === 'yahtzee'
      ? gameTypeRaw
      : 'tic_tac_toe'

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    iterations: Number.isFinite(iterationsRaw) ? Math.max(1, Math.floor(iterationsRaw)) : 40,
    concurrency: Number.isFinite(concurrencyRaw) ? Math.max(1, Math.floor(concurrencyRaw)) : 8,
    gameType,
    reportPath: readArg('report-path'),
  }
}

function randomLobbyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const rank = (p / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)

  if (low === high) return Number(sorted[low].toFixed(1))

  const weight = rank - low
  const value = sorted[low] * (1 - weight) + sorted[high] * weight
  return Number(value.toFixed(1))
}

function ratioPercent(successes: number, total: number): number {
  if (total <= 0) return 0
  return Number(((successes / total) * 100).toFixed(2))
}

async function postJson<T>(params: {
  url: string
  body: Record<string, unknown>
  headers?: Record<string, string>
}): Promise<ApiCallResult<T>> {
  const startedAt = Date.now()
  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params.headers || {}),
      },
      body: JSON.stringify(params.body),
    })

    let body: T | null = null
    let errorText: string | undefined
    try {
      body = (await response.json()) as T
    } catch {
      errorText = await response.text().catch(() => undefined)
    }

    return {
      ok: response.ok,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      body,
      errorText,
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      durationMs: Date.now() - startedAt,
      body: null,
      errorText: error instanceof Error ? error.message : 'Unknown fetch error',
    }
  }
}

async function createGuestSession(baseUrl: string): Promise<{
  guestId: string
  guestToken: string
}> {
  const suffix = Math.random().toString(36).slice(2, 8)
  const response = await postJson<{
    guestId?: string
    guestToken?: string
  }>({
    url: `${baseUrl}/api/auth/guest-session`,
    body: {
      guestName: `load-${suffix}`,
    },
  })

  if (!response.ok || !response.body?.guestId || !response.body?.guestToken) {
    throw new Error(
      `Failed to create guest session (status=${response.statusCode}, error=${response.errorText || 'n/a'})`
    )
  }

  return {
    guestId: response.body.guestId,
    guestToken: response.body.guestToken,
  }
}

async function createLobbyFixture(params: {
  creatorId: string
  gameType: LoadGameType
}): Promise<{ lobbyId: string }> {
  const initialState = createGameEngine(
    params.gameType,
    `load_waiting_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  ).getState()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const lobby = await prisma.lobbies.create({
        data: {
          code: randomLobbyCode(),
          name: `Load Fixture ${Date.now()}`,
          maxPlayers: 2,
          turnTimer: 60,
          gameType: params.gameType,
          creatorId: params.creatorId,
          games: {
            create: {
              status: 'waiting',
              gameType: params.gameType,
              state: JSON.stringify(initialState),
              players: {
                create: {
                  userId: params.creatorId,
                  position: 0,
                  scorecard: JSON.stringify({}),
                },
              },
            },
          },
        },
        select: {
          id: true,
        },
      })

      return { lobbyId: lobby.id }
    } catch (error) {
      if (attempt === 4) {
        throw error
      }
    }
  }

  throw new Error('Failed to create lobby fixture')
}

function extractAutoBotAdded(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const payload = body as { game?: { players?: Array<{ user?: { bot?: unknown } }> } }
  const players = Array.isArray(payload.game?.players) ? payload.game?.players : []
  return players.some((player) => !!player?.user?.bot)
}

function extractGameId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const payload = body as { game?: { id?: unknown } }
  return typeof payload.game?.id === 'string' ? payload.game.id : null
}

async function runSingleScenario(params: {
  options: ScriptOptions
  guestId: string
  guestToken: string
}): Promise<ScenarioResult> {
  const observations: StepObservation[] = []
  const headers = {
    'X-Guest-Token': params.guestToken,
  }

  const fixtureStart = Date.now()
  const fixture = await createLobbyFixture({
    creatorId: params.guestId,
    gameType: params.options.gameType,
  })
  observations.push({
    step: 'fixture_setup',
    success: true,
    durationMs: Date.now() - fixtureStart,
    statusCode: 200,
  })

  const createGameResponse = await postJson<unknown>({
    url: `${params.options.baseUrl}/api/game/create`,
    headers,
    body: {
      gameType: params.options.gameType,
      lobbyId: fixture.lobbyId,
      config: {
        maxPlayers: 2,
        minPlayers: 2,
      },
    },
  })
  observations.push({
    step: 'game_create_start_alone',
    success: createGameResponse.ok,
    durationMs: createGameResponse.durationMs,
    statusCode: createGameResponse.statusCode,
    error: createGameResponse.ok ? undefined : createGameResponse.errorText,
  })

  if (!createGameResponse.ok) {
    return {
      success: false,
      expectedAutoBot: true,
      autoBotAdded: false,
      observations,
    }
  }

  const autoBotAdded = extractAutoBotAdded(createGameResponse.body)
  const gameId = extractGameId(createGameResponse.body)
  if (!gameId) {
    return {
      success: false,
      expectedAutoBot: true,
      autoBotAdded,
      observations: [
        ...observations,
        {
          step: 'first_move_apply',
          success: false,
          durationMs: 0,
          statusCode: 0,
          error: 'Game ID missing in /api/game/create response',
        },
      ],
    }
  }

  const firstMoveBody =
    params.options.gameType === 'tic_tac_toe'
      ? {
          move: {
            playerId: params.guestId,
            type: 'place',
            data: { row: 0, col: 0 },
            timestamp: new Date().toISOString(),
          },
        }
      : params.options.gameType === 'rock_paper_scissors'
        ? {
            move: {
              playerId: params.guestId,
              type: 'submit-choice',
              data: { choice: 'rock' },
              timestamp: new Date().toISOString(),
            },
          }
        : {
            move: {
              playerId: params.guestId,
              type: 'roll',
              data: { held: [false, false, false, false, false] },
              timestamp: new Date().toISOString(),
            },
          }

  const firstMoveResponse = await postJson<unknown>({
    url: `${params.options.baseUrl}/api/game/${gameId}/state`,
    headers,
    body: firstMoveBody,
  })
  observations.push({
    step: 'first_move_apply',
    success: firstMoveResponse.ok,
    durationMs: firstMoveResponse.durationMs,
    statusCode: firstMoveResponse.statusCode,
    error: firstMoveResponse.ok ? undefined : firstMoveResponse.errorText,
  })

  const scenarioSuccess =
    createGameResponse.ok &&
    firstMoveResponse.ok &&
    autoBotAdded

  return {
    success: scenarioSuccess,
    expectedAutoBot: true,
    autoBotAdded,
    observations,
  }
}

function aggregateResults(results: ScenarioResult[]) {
  const stepNames = new Set<string>()
  for (const result of results) {
    for (const observation of result.observations) {
      stepNames.add(observation.step)
    }
  }

  const steps = Array.from(stepNames).map((step) => {
    const observations = results.flatMap((result) =>
      result.observations.filter((observation) => observation.step === step)
    )
    const successCount = observations.filter((observation) => observation.success).length
    const failCount = observations.length - successCount
    const successLatencies = observations
      .filter((observation) => observation.success)
      .map((observation) => observation.durationMs)

    return {
      step,
      attempts: observations.length,
      successCount,
      failCount,
      failRatePct: ratioPercent(failCount, observations.length),
      p95SuccessMs: percentile(successLatencies, 95),
    }
  })

  const scenarioSuccessCount = results.filter((result) => result.success).length
  const scenarioFailCount = results.length - scenarioSuccessCount
  const autoBotExpectedCount = results.filter((result) => result.expectedAutoBot).length
  const autoBotSuccessCount = results.filter(
    (result) => result.expectedAutoBot && result.autoBotAdded
  ).length

  return {
    totalScenarios: results.length,
    scenarioSuccessCount,
    scenarioFailCount,
    scenarioFailRatePct: ratioPercent(scenarioFailCount, results.length),
    autoBotExpectedCount,
    autoBotSuccessCount,
    autoBotSuccessRatioPct: ratioPercent(autoBotSuccessCount, autoBotExpectedCount),
    steps,
  }
}

async function main() {
  const options = parseOptions()
  console.log(
    `[load] starting operational load run: iterations=${options.iterations}, concurrency=${options.concurrency}, gameType=${options.gameType}, baseUrl=${options.baseUrl}`
  )

  const guestSession = await createGuestSession(options.baseUrl)
  const results: ScenarioResult[] = []
  let cursor = 0

  async function worker(workerId: number) {
    while (true) {
      const current = cursor
      cursor += 1
      if (current >= options.iterations) {
        return
      }

      try {
        const result = await runSingleScenario({
          options,
          guestId: guestSession.guestId,
          guestToken: guestSession.guestToken,
        })
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          expectedAutoBot: true,
          autoBotAdded: false,
          observations: [
            {
              step: 'scenario_error',
              success: false,
              durationMs: 0,
              statusCode: 0,
              error: error instanceof Error ? error.message : `Worker ${workerId} unknown error`,
            },
          ],
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: options.concurrency }, (_, index) => worker(index + 1))
  )

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    summary: aggregateResults(results),
  }

  console.log(JSON.stringify(report, null, 2))

  if (options.reportPath) {
    writeFileSync(options.reportPath, JSON.stringify(report, null, 2))
    console.log(`[load] report written to ${options.reportPath}`)
  }
}

main()
  .catch((error) => {
    console.error('[load] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
