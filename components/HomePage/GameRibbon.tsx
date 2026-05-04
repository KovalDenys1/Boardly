'use client'

import Link from 'next/link'
import GameIcon from '@/components/GameIcon'
import { getCatalogGames, type GameCatalogEntry } from '@/lib/game-catalog'
import { getGameLobbiesRoute } from '@/lib/public-game-access'
import { useTranslation } from '@/lib/i18n-helpers'

type CardStatus = GameCatalogEntry['availability']

interface GameCardProps {
  name: string
  tag: string
  players: string
  time: string
  diff: string
  desc: string
  href: string | null
  detailHref?: string
  status: CardStatus
  accentBg: string
  illustration: React.ReactNode
}

function GameCard({ name, tag, players, time, diff, desc, href, detailHref, status, accentBg, illustration }: GameCardProps) {
  const { t } = useTranslation()
  const badge = {
    available: { txt: t('games.playNow'), bg: 'rgba(79,201,166,0.18)', color: 'var(--bd-mint-deep)' },
    'in-development': { txt: t('home.ribbonBadgeLater'), bg: 'rgba(255,196,77,0.22)', color: 'var(--bd-ink-soft)' },
    planned: { txt: t('home.ribbonBadgePlanned'), bg: 'rgba(155,140,255,0.18)', color: 'var(--bd-lav-deep)' },
  }[status]

  return (
    <div
      style={{
        background: 'var(--bd-card-warm)',
        borderRadius: 24,
        border: '1.5px solid var(--bd-line)',
        boxShadow: '0 6px 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* illustration area */}
      <div style={{ background: accentBg, padding: '24px 16px', height: 160, display: 'grid', placeItems: 'center' }}>
        {illustration}
      </div>

      {/* content */}
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--bd-ink)',
            }}
          >
            {name}
          </h3>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.txt}
          </span>
        </div>

        <p style={{ fontSize: 14, color: 'var(--bd-ink-soft)', lineHeight: 1.5, flex: 1 }}>{desc}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[`👥 ${players}`, `⏱ ${time}`, diff, tag].map((chip) => (
            <span
              key={chip}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--bd-bg2)',
                color: 'var(--bd-ink-soft)',
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {status === 'available' && (detailHref ?? href) ? (
          <Link
            href={detailHref ?? href!}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 20px',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 15,
              background: 'var(--bd-ink)',
              color: 'var(--bd-bg)',
              boxShadow: '0 4px 0 var(--bd-coral)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            {t('games.seeGame')}
          </Link>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 20px',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 15,
              background: 'var(--bd-bg2)',
              color: 'var(--bd-ink-muted)',
              marginTop: 4,
            }}
          >
            {status === 'in-development' ? t('home.ribbonBadgeLater') : t('home.ribbonBadgePlanned')}
          </div>
        )}
      </div>
    </div>
  )
}

const GAME_ACCENT_BG: Record<string, string> = {
  yahtzee: 'rgba(125,211,252,0.15)',
  spy: 'rgba(155,140,255,0.12)',
  'tic-tac-toe': 'rgba(255,107,91,0.10)',
  memory: 'rgba(79,201,166,0.12)',
}

const GAME_DETAIL_HREF: Record<string, string> = {
  yahtzee: '/games/yahtzee',
  spy: '/games/spy',
  'tic-tac-toe': '/games/tic-tac-toe',
  memory: '/games/memory',
}

function fallbackName(id: string) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getIllustration(gameId: string, emoji: string) {
  switch (gameId) {
    case 'yahtzee':
      return (
        <div className="bd-float" style={{ animationDelay: '0s' }}>
          <GameIcon gameId="yahtzee" accentColor="var(--bd-sky)" size={72} />
        </div>
      )
    case 'spy':
      return (
        <div className="bd-float" style={{ animationDelay: '0.4s' }}>
          <GameIcon gameId="spy" accentColor="var(--bd-lav)" size={72} />
        </div>
      )
    case 'tic-tac-toe':
      return (
        <div className="bd-float" style={{ animationDelay: '0.8s' }}>
          <GameIcon gameId="tic-tac-toe" accentColor="var(--bd-coral)" size={72} />
        </div>
      )
    case 'memory':
      return (
        <div className="bd-float" style={{ animationDelay: '1.2s' }}>
          <GameIcon gameId="memory" accentColor="var(--bd-mint)" size={72} />
        </div>
      )
    default:
      return <div className="bd-float" style={{ fontSize: 64 }}>{emoji}</div>
  }
}

export default function GameRibbon() {
  const { t } = useTranslation()
  const catalogGames = getCatalogGames()
  const availableGames = catalogGames.filter((game) => game.availability === 'available')
  const inDevelopmentCount = catalogGames.filter((game) => game.availability === 'in-development').length
  const plannedCount = catalogGames.filter((game) => game.availability === 'planned').length

  const translatedDetails: Record<string, Omit<GameCardProps, 'href' | 'status' | 'illustration'>> = {
    yahtzee: {
      name: t('games.yahtzee.name'),
      tag: t('games.yahtzee.ribbon.tag'),
      players: '2-4',
      time: t('games.yahtzee.ribbon.time'),
      diff: t('games.yahtzee.difficulty'),
      desc: t('games.yahtzee.ribbon.desc'),
      accentBg: GAME_ACCENT_BG.yahtzee,
      detailHref: GAME_DETAIL_HREF.yahtzee,
    },
    spy: {
      name: t('games.spy.name'),
      tag: t('games.spy.ribbon.tag'),
      players: '3-8',
      time: t('games.spy.ribbon.time'),
      diff: t('games.spy.difficulty'),
      desc: t('games.spy.ribbon.desc'),
      accentBg: GAME_ACCENT_BG.spy,
      detailHref: GAME_DETAIL_HREF.spy,
    },
    'tic-tac-toe': {
      name: t('games.tictactoe.name'),
      tag: t('games.tictactoe.ribbon.tag'),
      players: '2',
      time: t('games.tictactoe.ribbon.time'),
      diff: t('games.tictactoe.difficulty'),
      desc: t('games.tictactoe.ribbon.desc'),
      accentBg: GAME_ACCENT_BG['tic-tac-toe'],
      detailHref: GAME_DETAIL_HREF['tic-tac-toe'],
    },
    memory: {
      name: t('games.memory.name'),
      tag: t('games.memory.ribbon.tag'),
      players: '2-4',
      time: t('games.memory.ribbon.time'),
      diff: t('games.memory.difficulty'),
      desc: t('games.memory.ribbon.desc'),
      accentBg: GAME_ACCENT_BG.memory,
      detailHref: GAME_DETAIL_HREF.memory,
    },
  }

  const cards: GameCardProps[] = availableGames.map((game) => {
    const details = translatedDetails[game.id] ?? {
      name: fallbackName(game.id),
      tag: '',
      players: game.players,
      time: '',
      diff: '',
      desc: '',
      accentBg: 'rgba(155,140,255,0.12)',
    }
    const href = game.route ?? getGameLobbiesRoute(game.gameType)

    return {
      ...details,
      href,
      status: game.availability,
      illustration: getIllustration(game.id, game.emoji),
    }
  })

  return (
    <section className="home-section home-section-games">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--bd-ink-muted)',
            }}
          >
            {t('header.games')}
          </span>
          <h2
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 36,
              fontWeight: 700,
              color: 'var(--bd-ink)',
              marginTop: 8,
              letterSpacing: 0,
            }}
          >
            {t('home.chooseWhatToPlay')}
          </h2>
          <p style={{ marginTop: 10, color: 'var(--bd-ink-soft)', fontSize: 15, maxWidth: 560, lineHeight: 1.5 }}>
            {t('home.ribbonDescription', { available: availableGames.length, more: inDevelopmentCount + plannedCount })}
          </p>
        </div>
        <Link
          href="/games"
          style={{
            padding: '12px 20px',
            borderRadius: 14,
            fontWeight: 600,
            fontSize: 15,
            background: 'var(--bd-card-warm)',
            color: 'var(--bd-ink)',
            border: '1px solid var(--bd-line)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          {t('home.seeAllGames')}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {cards.map((g) => (
          <GameCard key={g.name} {...g} />
        ))}
      </div>
    </section>
  )
}
