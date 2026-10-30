import { prisma } from './db'
import { apiLogger } from './logger'
import type { LobbyReopenAgeBucket } from './lobby-lifecycle'
import type { ServerOperationalEventName } from './operational-events'

const log = apiLogger('lobby-reopen')

export interface LobbyReopenedEvent {
  lobbyId: string
  lobbyCode: string
  gameType: string
  /** The fresh waiting game the opener is seated in. */
  gameId: string
  reopenedBy: { userId: string; isGuest: boolean }
  ageBucket: LobbyReopenAgeBucket
}

/**
 * Everything that follows a table being reopened by its old link, run once per reopen after
 * the new game has committed. Server-only, like `second_human_joined`: absent from
 * OPERATIONAL_EVENT_NAMES, so the public beacon cannot forge it. Never throws – the table is
 * already open, and a lost side effect must not turn that into an error for the opener.
 */
export async function onLobbyReopened(event: LobbyReopenedEvent): Promise<void> {
  try {
    await prisma.operationalEvents.create({
      data: {
        eventName: 'lobby_reopened' satisfies ServerOperationalEventName,
        metricType: 'flow',
        gameType: event.gameType,
        isGuest: event.reopenedBy.isGuest,
        payload: {
          lobby_code: event.lobbyCode,
          game_type: event.gameType,
          age_bucket: event.ageBucket,
        },
      },
    })
  } catch (err) {
    log.error('Failed to record lobby_reopened', err instanceof Error ? err : new Error(String(err)), {
      lobbyId: event.lobbyId,
    })
  }
}
