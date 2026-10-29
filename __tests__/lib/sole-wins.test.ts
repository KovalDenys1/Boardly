import { soleWinnerSql, soleWinsWhere } from '@/lib/server/sole-wins'
import { resolveOutcome } from '@/lib/stats-core'

describe('sole wins (#1493)', () => {
  it('counts a finished game as a win only when no other seat in it is a recorded winner', () => {
    expect(soleWinsWhere('me')).toEqual({
      userId: 'me',
      isWinner: true,
      game: { status: 'finished', players: { none: { isWinner: true, userId: { not: 'me' } } } },
    })
  })

  it('says in SQL that the row is its game’s only winner', () => {
    const { sql } = soleWinnerSql('p')
    expect(sql.replace(/\s+/g, ' ')).toBe(
      'p."isWinner" = true AND NOT EXISTS ( SELECT 1 FROM "Players" other WHERE other."gameId" = p."gameId" AND other."isWinner" = true AND other.id <> p.id )',
    )
  })

  it('is the stats rule: one winner is a win, several are a draw', () => {
    expect(resolveOutcome('finished', true, 1)).toBe('win')
    expect(resolveOutcome('finished', true, 2)).toBe('draw')
    expect(resolveOutcome('finished', false, 2)).toBe('loss')
  })
})
