import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'

export interface KickedPlayer {
  userId: string
  /** Null when the account is gone – a guest is hard-deleted after three days. */
  username: string | null
  avatarUrl: string | null
}

interface WaitingRoomGuideProps {
  /** Lobby game type, in its stored form (`tic_tac_toe`, `guess_the_spy`, …). */
  gameType?: string | null
  /** Host-only; empty for everyone else, because the list is never sent to them. */
  kickedPlayers?: KickedPlayer[]
  onUnkickPlayer?: (userId: string) => void
}

/**
 * One rule line per game. Games without an entry fall back to the generic line
 * rather than to English prose: `GameEngine.getGameRules()` exists and reads
 * better, but it returns hardcoded English, so it cannot go on screen.
 */
const RULE_KEY_BY_GAME_TYPE: Record<string, TranslationKeys> = {
  yahtzee: 'game.ui.howToPlayRuleYahtzee',
  guess_the_spy: 'game.ui.howToPlayRuleSpy',
  tic_tac_toe: 'game.ui.howToPlayRuleTicTacToe',
  rock_paper_scissors: 'game.ui.howToPlayRuleRps',
  memory: 'game.ui.howToPlayRuleMemory',
  connect_four: 'game.ui.howToPlayRuleConnectFour',
  alias: 'game.ui.howToPlayRuleAlias',
}

/**
 * The region under the player list (#899).
 *
 * The waiting room used to stop at the last player row and leave ~340 px of empty
 * card above the Start bar at 1280x900, which the layout Definition of Done calls
 * out by name. This is the one region that fills it: what this game asks of you,
 * and – for the host – who was removed from the lobby, which is the undo half of
 * #1024. One panel with two sections, not two cards stacked.
 */
export default function WaitingRoomGuide({
  gameType,
  kickedPlayers,
  onUnkickPlayer,
}: WaitingRoomGuideProps) {
  const { t } = useTranslation()

  const ruleKey = (gameType && RULE_KEY_BY_GAME_TYPE[gameType]) || 'game.ui.howToPlayRuleFallback'
  const steps: string[] = [
    t('game.ui.howToPlayReady'),
    t(ruleKey),
    t('game.ui.howToPlayStart'),
  ]

  const removed = onUnkickPlayer ? (kickedPlayers ?? []) : []

  return (
    <section className="flex flex-1 flex-col rounded-xl border border-bd-line bg-bd-bg2/60 px-3 py-3 sm:px-4">
      {/* The steps take the slack, so the panel reads as a filled region at any
          height instead of a small card floating in one. */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <Icon name="info" size={16} />
          <h2 className="text-sm font-bold text-bd-ink">{t('game.ui.howToPlayTitle')}</h2>
        </div>
        <p className="mt-1 text-xs text-bd-ink-muted">{t('game.ui.howToPlayDescription')}</p>

        <ol className="mt-3 space-y-2">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-bd-line bg-bd-card-warm text-xs font-extrabold text-bd-ink-soft"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-relaxed text-bd-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {removed.length > 0 && (
        <div className="mt-4 border-t border-bd-line pt-3">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={14} />
            <h3 className="text-xs font-bold text-bd-ink">{t('game.ui.removedPlayers')}</h3>
            <span className="rounded-full bg-bd-bg2 px-1.5 py-0.5 text-[10px] font-bold text-bd-ink-soft">
              {removed.length}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-bd-ink-muted">{t('game.ui.removedPlayersHint')}</p>

          <ul className="mt-2 space-y-1.5">
            {removed.map((player) => {
              const name = player.username || t('game.ui.player')
              return (
                <li
                  key={player.userId}
                  className="flex items-center gap-2.5 rounded-lg border border-bd-line bg-bd-card-warm px-2.5 py-2"
                >
                  {player.avatarUrl ? (
                    <img
                      src={player.avatarUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-lg border border-bd-line object-cover opacity-60"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-bd-line bg-bd-bg2 text-bd-ink-muted"
                    >
                      <Icon name="user" size={14} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-bd-ink-soft">
                    {name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnkickPlayer?.(player.userId)}
                    className="bd-btn bd-btn-soft shrink-0 gap-1 px-2.5 py-1.5 text-[11px]"
                  >
                    <Icon name="plus" size={12} />
                    <span>{t('game.ui.letBackIn')}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
