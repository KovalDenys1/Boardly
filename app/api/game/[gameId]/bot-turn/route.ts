import { NextRequest, NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { constantTimeEqual } from '@/lib/secret-compare'
import { runBotTurn } from '@/lib/bot-turn-runner'

export const maxDuration = 60 // Allow up to 60 seconds for bot execution

/** An upstream `triggeredAt` older than this is a stale clock or a retry, not a turn start. */
const MAX_TRIGGER_AGE_MS = 60_000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('POST /api/game/[gameId]/bot-turn')
  const requestStartedAt = Date.now()
  let gameId: string | undefined

  try {
    const paramsData = await params
    gameId = paramsData.gameId
    const configuredInternalSecret = process.env.BOARDLY_INTERNAL_SECRET?.trim()
    const providedInternalSecret = request.headers.get('X-Internal-Secret')
    const hasConfiguredInternalSecret =
      typeof configuredInternalSecret === 'string' && configuredInternalSecret.length > 0
    const isAuthorizedInternalRequest =
      hasConfiguredInternalSecret &&
      providedInternalSecret !== null &&
      constantTimeEqual(providedInternalSecret, configuredInternalSecret)
    const requestUser = isAuthorizedInternalRequest ? null : await getRequestAuthUser(request)

    if (!isAuthorizedInternalRequest && !requestUser?.id) {
      log.warn('Unauthorized bot turn request', {
        gameId: gameId,
        hasInternalSecret: !!providedInternalSecret,
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestBody = await request.json()
    const { botUserId, lobbyCode, triggerSource, triggeredAt, turnEndToBotTriggerMs } = requestBody
    const resolvedTriggerSource =
      typeof triggerSource === 'string' && triggerSource.length > 0 ? triggerSource : 'unknown'
    const normalizedTriggeredAt =
      typeof triggeredAt === 'number' && Number.isFinite(triggeredAt) ? triggeredAt : null
    const triggerToBotApiLatencyMs =
      normalizedTriggeredAt !== null ? Math.max(0, Date.now() - normalizedTriggeredAt) : null
    const normalizedTurnEndToBotTriggerMs =
      typeof turnEndToBotTriggerMs === 'number' && Number.isFinite(turnEndToBotTriggerMs)
        ? Math.max(0, turnEndToBotTriggerMs)
        : null

    if (!botUserId) {
      return NextResponse.json({ error: 'Bot user ID required' }, { status: 400 })
    }

    log.info('Bot turn endpoint called', {
      gameId: gameId,
      botUserId,
      triggerSource: resolvedTriggerSource,
      triggerToBotApiLatencyMs,
      turnEndToBotTriggerMs: normalizedTurnEndToBotTriggerMs,
    })

    // Only an internal caller's clock marks when the turn became the bot's; anything
    // else measures from this request's arrival.
    const turnStartedAt =
      isAuthorizedInternalRequest &&
      normalizedTriggeredAt !== null &&
      normalizedTriggeredAt <= requestStartedAt &&
      requestStartedAt - normalizedTriggeredAt <= MAX_TRIGGER_AGE_MS
        ? normalizedTriggeredAt
        : requestStartedAt

    const outcome = await runBotTurn({
      gameId,
      botUserId,
      lobbyCode,
      requesterId: isAuthorizedInternalRequest ? undefined : requestUser?.id,
      source: isAuthorizedInternalRequest ? resolvedTriggerSource : 'client',
      turnStartedAt,
    })
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (error) {
    log.error('Bot turn request failed', error as Error, { gameId })
    return NextResponse.json({
      error: 'Internal server error',
      code: 'BOT_TURN_FAILED',
    }, { status: 500 })
  }
}
