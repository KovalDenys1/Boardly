import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeStep } from '@/lib/replay/captions'
import { groupSteps } from '@/lib/replay/group-steps'
import type { ReplayContext, ReplayPlayer, ReplaySnapshotInput } from '@/lib/replay/types'

export function loadReplayFixture(gameType: string): { players: ReplayPlayer[]; snapshots: ReplaySnapshotInput[] } {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', 'fixtures', 'replays', `${gameType}.json`), 'utf-8'))
}

describe.each(['tic_tac_toe', 'connect_four', 'checkers', 'ludo'])('%s fixture', (gameType) => {
  const fixture = loadReplayFixture(gameType)
  const ctx: ReplayContext = {
    seats: fixture.players,
    playerNameById: new Map(fixture.players.map((p) => [p.userId, p.name])),
    viewerId: fixture.players[0].userId,
  }
  const steps = groupSteps(gameType, fixture.snapshots)

  it('opens on the start and ends on a finished game', () => {
    expect(steps[0].kind).toBe('start')
    expect((steps.at(-1)?.state as { status: string }).status).toBe('finished')
    expect(steps.length).toBeGreaterThan(2)
  })

  it('has a caption for every step', () => {
    for (const step of steps) {
      expect(describeStep(gameType, step, ctx).key).not.toBe('profile.gameReplay.unknownAction')
    }
  })
})
