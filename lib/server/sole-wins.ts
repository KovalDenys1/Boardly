import { Prisma } from '@/prisma/client'

// A win counts only when it is the game's single one: several recorded winners shared the top,
// which lib/stats-core.ts resolveOutcome reads as a draw (#1493). These are that rule in query form.

/** The user's finished games that they alone won. */
export function soleWinsWhere(userId: string): Prisma.PlayersWhereInput {
  return {
    userId,
    isWinner: true,
    game: {
      status: 'finished',
      players: { none: { isWinner: true, userId: { not: userId } } },
    },
  }
}

/** SQL condition: the Players row under `alias` is the only winner of its game. */
export function soleWinnerSql(alias: string): Prisma.Sql {
  const row = Prisma.raw(alias)
  return Prisma.sql`${row}."isWinner" = true AND NOT EXISTS (
    SELECT 1 FROM "Players" other
    WHERE other."gameId" = ${row}."gameId" AND other."isWinner" = true AND other.id <> ${row}.id
  )`
}
