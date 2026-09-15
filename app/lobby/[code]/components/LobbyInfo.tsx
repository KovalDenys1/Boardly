import { useRouter } from 'next/navigation'
import { getGameMetadata } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
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
  const router = useRouter()
  const { t } = useTranslation()
  const gameMeta = lobby.gameType ? getGameMetadata(lobby.gameType) : null
  const isPrivate = Boolean(lobby?.isPrivate)
  const isPlaying = game?.status === 'playing'
  // Auto-generated names ("Quick Play 5093") already contain the code — the
  // clickable code chip next to the title is the single place it's shown.
  const displayName = (() => {
    const withoutCode = lobby.name?.replace(new RegExp(`\\s*${lobby.code}\\s*$`), '') ?? ''
    return withoutCode.trim() || lobby.name
  })()

  // The link carries a share marker so the lobby page can tell an invited arrival from a
  // typed code; the event names which affordance was used (#920). On a phone this opens the
  // OS share sheet and on a desktop it copies, both through the one helper (#927).
  const shareInvite = useInviteShare(lobby.code)
  const handleCopyInvite = (source: InviteCopySource) => {
    void shareInvite(source)
  }

  return (
    <div className="flex-shrink-0 border-b border-bd-line bg-bd-card-warm">
      <div className="px-4 py-3 sm:px-5">
        {/* Utility bar: breadcrumbs left, action buttons right — same on all sizes */}
        <div className="flex items-center gap-3">
          {/* Breadcrumbs — ultra-compact, single line (truncates instead of wrapping) */}
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden whitespace-nowrap text-[10px] text-bd-ink-muted" aria-label="breadcrumb">
            <button
              onClick={() => router.push('/')}
              aria-label={t('common.goHome')}
              className="shrink-0 rounded px-1 py-0.5 transition-colors hover:text-bd-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bd-ink/30"
            >
              <Icon name="home" size={14} /> {t('breadcrumbs.home')}
            </button>
            <span aria-hidden="true" className="shrink-0 opacity-30">›</span>
            <button
              onClick={() => router.push('/games')}
              aria-label={t('games.title')}
              className="shrink-0 rounded px-1 py-0.5 transition-colors hover:text-bd-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bd-ink/30"
            >
              <Icon name="gamepad" size={14} /> {t('breadcrumbs.games')}
            </button>
            <span aria-hidden="true" className="shrink-0 opacity-30">›</span>
            <button
              onClick={() => router.push(getGameLobbiesRoute(lobby?.gameType) ?? '/games')}
              aria-label={t('lobby.activeLobbies')}
              className="min-w-0 truncate rounded px-1 py-0.5 transition-colors hover:text-bd-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bd-ink/30"
            >
              {gameMeta?.name ?? 'Game'}
            </button>
          </nav>

          {/* Utility buttons */}
          <div className="flex shrink-0 items-center gap-1">
            {onToggleSettings && (
              <button
                onClick={onToggleSettings}
                title={t('game.ui.settings')}
                aria-label={t('game.ui.settings')}
                aria-expanded={settingsOpen}
                className={`bd-btn bd-btn-soft gap-1.5 px-2.5 py-2 text-xs sm:px-3 ${settingsOpen ? 'bg-bd-bg2' : ''}`}
              >
                <Icon name="gear" size={16} />
              </button>
            )}
            <button
              onClick={() => handleCopyInvite('lobby_header_button')}
              title={t('game.ui.copyInvite')}
              className="bd-btn bd-btn-soft gap-1.5 px-2.5 py-2 text-xs sm:px-3"
            >
              <Icon name="link" size={14} />
              <span className="hidden sm:inline">{t('game.ui.copyInvite')}</span>
            </button>
            <button
              onClick={onLeave}
              aria-label={t('game.ui.leave')}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border-[1.5px] border-bd-coral/45 bg-bd-coral/15 px-2.5 py-2 text-xs font-semibold text-bd-coral-deep transition-all hover:border-bd-coral hover:bg-bd-coral hover:text-white active:scale-95 sm:px-3 sm:text-sm"
            >
              <LeaveIcon />
              <span className="hidden sm:inline">{t('game.ui.leave')}</span>
            </button>
          </div>
        </div>

        {/* Identity row: icon + title + chips get the full card width */}
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

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <h1
              className="truncate text-xl font-extrabold leading-tight tracking-tight text-bd-ink sm:text-2xl"
              style={{ fontFamily: 'var(--bd-font-display)' }}
            >
              {displayName}
            </h1>
            {/* Code chip — clicking copies the invite link */}
            <button
              onClick={() => handleCopyInvite('lobby_code_chip')}
              title={t('game.ui.copyInvite')}
              className="bd-chip border-2 border-bd-ink bg-bd-ink font-mono text-[11px] text-bd-bg transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bd-ink/30 cursor-pointer"
            >
              {lobby.code}
            </button>
            <span className={`bd-chip text-[10px] px-2 py-0.5 ${isPrivate ? 'border-bd-coral/45 bg-bd-coral/15 text-bd-coral-deep' : 'bd-chip-mint'}`}>
              {isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
            </span>
            <span className="bd-chip text-[10px] px-2 py-0.5">
              {isPlaying ? t('lobby.status.playing') : t('lobby.status.waiting')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
