import { notFound } from 'next/navigation'
import ResultFixture, { type FixtureGame, type FixtureState } from './ResultFixture'

/**
 * Dev-only stage for the end-of-game dialog (GameResultOverlay): every state
 * in every game's accent, at any viewport, light or dark. `?state=` win | loss
 * | draw | standings | waiting | crowd, `?game=` ttt | c4 | memory | yahtzee | ludo,
 * `?theme=dark`, `?view=more`, and `?surface=yahtzee` for Yahtzee's results page under it. The fit check in e2e/result-overlay-fit.spec.ts
 * runs against it. Never shipped: 404 in production.
 */
export const metadata = { robots: { index: false, follow: false } }

const STATES: FixtureState[] = ['win', 'loss', 'draw', 'standings', 'waiting', 'crowd']
const GAMES: FixtureGame[] = ['ttt', 'c4', 'memory', 'yahtzee', 'ludo']

export default async function DevResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = await searchParams
  const pick = <T extends string>(value: unknown, options: T[]): T =>
    options.includes(value as T) ? (value as T) : options[0]
  return (
    <ResultFixture
      state={pick(params.state, STATES)}
      game={pick(params.game, GAMES)}
      dark={params.theme === 'dark'}
      openMore={params.view === 'more'}
      surface={params.surface === 'yahtzee' ? 'yahtzee' : 'fixture'}
    />
  )
}
