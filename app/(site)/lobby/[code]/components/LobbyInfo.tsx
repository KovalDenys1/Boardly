import { getCatalogEntryById, getGameMetadata } from '@/lib/game-catalog'
import Breadcrumbs from '@/components/Breadcrumbs'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { getGameLobbiesRoute } from '@/lib/public-game-access'
import LeaveIcon from '@/components/LeaveIcon'
import { useInviteShare } from '@/hooks/useInviteShare'
import type { InviteCopySource } from '@/lib/analytics'
import type { Game, Lobby } from '@/types/game'

interface LobbyInfoProps {
  lobby: Lobby
  game: Game | null
  /** Whether the lobby settings view is currently shown (gear button state). */
  settingsOpen?: boolean
  onToggleSettings?: () => void
  onLeave: () => void
}

export default function LobbyInfo({
  lobby,
  game,
  settingsOpen = false,
  onToggleSettings,
  onLeave,
}: LobbyInfoProps) {
  const { t } = useTranslation()
  const gameMeta = lobby.gameType ? getGameMetadata(lobby.gameType) : null
  const nameKey = gameMeta ? getCatalogEntryById(gameMeta.svgId)?.nameKey : undefined
  const gameName = nameKey ? t(nameKey as TranslationKeys) : gameMeta?.name ?? null
  const isPrivate = Boolean(lobby?.isPrivate)
  const isPlaying = game?.status === 'playing'
  // "Lobby 4821" and "Quick Play 4821" are generated, so only a name the host typed is shown.
  const nameWithoutCode = lobby.name?.replace(new RegExp(`\\s*${lobby.code}\\s*$`), '').trim() ?? ''
  const customName = nameWithoutCode && nameWithoutCode !== 'Lobby' && nameWithoutCode !== 'Quick Play' ? lobby.name : null

  // The link carries a share marker so the lobby page can tell an invited arrival from a
  // typed code; the event names which affordance was used (#920). On a phone this opens the
  // OS share sheet and on a desktop it copies, both through the one helper (#927).
  const shareInvite = useInviteShare(lobby.code)
  const handleCopyInvite = (source: InviteCopySource) => {
    void shareInvite(source)
  }

  return (
    <div className="shrink-0 border-b border-bd-line bg-bd-card-warm">
      <div className="px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <Breadcrumbs
            compact
            className="grow basis-36 pt-1.5"
            label={t('breadcrumbs.label')}
            items={[
              { label: t('breadcrumbs.home'), href: '/' },
              { label: t('breadcrumbs.games'), href: '/games' },
              ...(gameName ? [{ label: gameName, href: getGameLobbiesRoute(lobby.gameType) ?? '/games' }] : []),
            ]}
          />

          {/* Utility buttons */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {onToggleSettings && (
              <button
                onClick={onToggleSettings}
                title={t('game.ui.settings')}
                aria-label={t('game.ui.settings')}
                aria-expanded={settingsOpen}
                className={`bd-btn bd-btn-soft gap-1.5 px-2.5 py-2 text-xs sm:px-3! ${settingsOpen ? 'bg-bd-bg2' : ''}`}
              >
                <Icon name="gear" size={16} />
              </button>
            )}
            <button
              onClick={() => handleCopyInvite('lobby_header_button')}
              title={t('game.ui.copyInvite')}
              className="bd-btn bd-btn-soft gap-1.5 px-2.5 py-2 text-xs sm:px-3!"
            >
              <Icon name="link" size={14} />
              <span className="hidden sm:inline">{t('game.ui.copyInvite')}</span>
            </button>
            <button
              onClick={onLeave}
              aria-label={t('game.ui.leave')}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border-[1.5px] border-bd-coral/45 bg-bd-coral/15 px-2.5 py-2 text-xs font-semibold text-bd-coral-text transition hover:border-bd-coral hover:bg-bd-coral hover:text-bd-ink-on-accent active:scale-95 sm:px-3 sm:text-sm"
            >
              <LeaveIcon />
              <span className="hidden sm:inline">{t('game.ui.leave')}</span>
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-bd-ink bg-bd-sun text-xl shadow-[2px_2px_0_var(--bd-ink)] sm:h-14 sm:w-14 sm:rounded-2xl sm:text-[28px] sm:shadow-[3px_3px_0_var(--bd-ink)]"
            aria-hidden="true"
          >
            {gameMeta ? (
              <GameIcon gameId={gameMeta.svgId} accentColor="var(--bd-ink-on-accent)" detailColor="var(--bd-sun)" size={28} variant="bare" />
            ) : (
              <Icon name="gamepad" size={28} tone="on-accent" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1
                className="min-w-0 break-words text-xl font-extrabold leading-tight tracking-tight text-bd-ink sm:text-2xl sm:leading-8"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                {gameName ?? (nameWithoutCode || lobby.name)} · <span className="tabular-nums">{lobby.code}</span>
              </h1>
              <span className={`bd-chip text-[10px] px-2 py-0.5 ${isPrivate ? 'border-bd-coral/45 bg-bd-coral/15 text-bd-coral-text' : 'bd-chip-mint'}`}>
                {isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
              </span>
              <span className="bd-chip text-[10px] px-2 py-0.5">
                {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
              </span>
            </div>
            {gameName && customName && (
              <p className="mt-0.5 break-words text-sm text-bd-ink-soft">{customName}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
