'use client'

import type { CSSProperties } from 'react'
import { Icon, type IconName } from '@/components/icons'
import Die from '@/components/ui/Die'
import GameIcon from '@/components/GameIcon'
import type { TranslationKeys } from '@/lib/i18n-helpers'

type Translate = (key: TranslationKeys, params?: Record<string, unknown>) => string

type GameArtProps = {
  gameType: string
  svgId: string
  accentColor: string
  memoryDifficulty: 'easy' | 'medium' | 'hard'
  t: Translate
}

const inkCard: CSSProperties = {
  background: 'white',
  border: '2px solid var(--bd-ink)',
  boxShadow: '3px 3px 0 var(--bd-ink)',
}

function TicTacToeArt() {
  const size = 3
  const dim = 132
  const marks: Record<number, 'X' | 'O'> = { 4: 'X', 0: 'O', 8: 'X' }
  return (
    <div
      style={{
        ...inkCard,
        width: dim, height: dim, borderRadius: 16, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`,
        boxShadow: '4px 4px 0 var(--bd-ink)',
      }}
    >
      {Array.from({ length: size * size }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid', placeItems: 'center',
            borderRight: i % size < size - 1 ? '1.5px solid var(--bd-line)' : 'none',
            borderBottom: Math.floor(i / size) < size - 1 ? '1.5px solid var(--bd-line)' : 'none',
            fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 26,
            color: marks[i] === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav-deep)',
          }}
        >
          {marks[i] ?? ''}
        </div>
      ))}
    </div>
  )
}

function ConnectFourArt() {
  const cols = 7
  const rows = 6
  const cell = 18
  // Bottom-up columns of the demo position: coral and sun discs, as on the home page demo.
  const stacks: ('c' | 's')[][] = [[], ['s'], ['c', 's'], ['c', 'c', 's'], ['s', 'c'], ['s'], []]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
        gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        gap: 5, padding: 8, borderRadius: 14,
        background: 'rgba(31,27,22,0.15)',
        border: '2.5px solid var(--bd-ink)',
        boxShadow: '0 4px 0 rgba(31,27,22,0.2)',
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        const disc = stacks[c][rows - 1 - r]
        return (
          <span
            key={i}
            style={{
              borderRadius: '50%',
              background: disc === 'c' ? 'var(--bd-coral)' : disc === 's' ? 'var(--bd-sun)' : 'rgba(255,255,255,0.4)',
              border: disc ? '2px solid var(--bd-ink)' : '1.5px solid rgba(31,27,22,0.2)',
            }}
          />
        )
      })}
    </div>
  )
}

function YahtzeeArt() {
  const values = [6, 3, 3, 1, 5]
  const rotations = [-5, 3, -8, 5, -3]
  const offsets = [0, -4, 0, -6, 2]
  return (
    <div className="flex items-end gap-2">
      {values.map((v, i) => (
        <div key={i} style={{ transform: `translateY(${offsets[i]}px)` }}>
          <Die value={v} size={44} rotate={`${rotations[i]}deg`} />
        </div>
      ))}
    </div>
  )
}

function MemoryArt({ difficulty }: { difficulty: GameArtProps['memoryDifficulty'] }) {
  const cols = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6
  const sz = difficulty === 'easy' ? 30 : difficulty === 'medium' ? 26 : 22
  // emoji-allow: memory card faces
  const faces = ['🦊', '🐧', '🦁', '🐬', '🌟', '🍕']
  const revealed = [0, 5, 3]
  const total = cols * 3
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${sz}px)`, gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: sz, height: sz, borderRadius: 7, display: 'grid', placeItems: 'center',
            background: revealed.includes(i) ? 'white' : 'var(--bd-ink)',
            border: '1.5px solid var(--bd-line)', fontSize: sz * 0.52,
          }}
        >
          {revealed.includes(i) ? faces[i % faces.length] : ''}
        </div>
      ))}
    </div>
  )
}

function FannedCards({ cards, width, height }: { cards: { icon: IconName; label: string; dark?: boolean }[]; width: number; height: number }) {
  const rotations = [-6, 0, 6]
  const offsets = [4, 0, 4]
  return (
    <div className="flex items-end gap-2">
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            ...inkCard,
            width, height, borderRadius: 14, flexShrink: 0,
            background: card.dark ? 'var(--bd-ink)' : 'white',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
            transform: `rotate(${rotations[i]}deg) translateY(${offsets[i]}px)`,
          }}
        >
          <Icon name={card.icon} size={24} />
          <span
            style={{
              fontSize: 10, fontWeight: 700,
              color: card.dark ? 'rgba(255,255,255,0.6)' : 'var(--bd-ink-muted)',
            }}
          >
            {card.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function AliasArt({ t }: { t: Translate }) {
  return (
    <div style={{ ...inkCard, width: 176, borderRadius: 18, padding: '16px 18px', transform: 'rotate(-2deg)', boxShadow: '4px 4px 0 var(--bd-ink)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bd-ink-muted)', marginBottom: 8 }}>
        {t('lobby.create.preview.aliasPrompt')}
      </div>
      <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, color: '#1F1B16', marginBottom: 12, lineHeight: 1.1 }}>
        {t('lobby.create.preview.aliasWord')}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#F2E9D8', overflow: 'hidden' }}>
        <div style={{ width: '60%', height: '100%', background: 'var(--bd-mint)', borderRadius: 3 }} />
      </div>
    </div>
  )
}

function LiarsPartyArt() {
  // emoji-allow: playing-card suits are card content, not interface chrome
  const cards = [{ rank: 'K', suit: '♠', red: false }, { rank: 'A', suit: '♥', red: true }, { rank: '7', suit: '♣', red: false }, { rank: 'Q', suit: '♦', red: true }]
  const rotations = [-8, -3, 3, 8]
  return (
    <div style={{ position: 'relative', width: 160, height: 96 }}>
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            ...inkCard,
            position: 'absolute', top: 0, left: i * 28,
            width: 60, height: 84, borderRadius: 10,
            boxShadow: '2px 2px 0 var(--bd-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `rotate(${rotations[i]}deg)`,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--bd-font-display)', color: card.red ? 'var(--bd-coral)' : '#1F1B16' }}>
            {card.rank}{card.suit}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A small picture of the chosen game for the create page; decorative, so hidden from assistive tech. */
export default function GameArt({ gameType, svgId, accentColor, memoryDifficulty, t }: GameArtProps) {
  let art: React.ReactNode
  switch (gameType) {
    case 'tic_tac_toe':
      art = <TicTacToeArt />
      break
    case 'connect_four':
      art = <ConnectFourArt />
      break
    case 'yahtzee':
      art = <YahtzeeArt />
      break
    case 'memory':
      art = <MemoryArt difficulty={memoryDifficulty} />
      break
    case 'guess_the_spy':
      art = (
        <FannedCards
          width={72}
          height={98}
          cards={[
            { icon: 'map', label: t('lobby.create.preview.spyCardBeach') },
            { icon: 'mask', label: '???', dark: true },
            { icon: 'map', label: t('lobby.create.preview.spyCardMountain') },
          ]}
        />
      )
      break
    case 'rock_paper_scissors':
      art = (
        <FannedCards
          width={68}
          height={88}
          cards={[
            { icon: 'rock', label: t('lobby.choice.rock') },
            { icon: 'paper', label: t('lobby.choice.paper') },
            { icon: 'scissors', label: t('lobby.choice.scissors') },
          ]}
        />
      )
      break
    case 'alias':
      art = <AliasArt t={t} />
      break
    case 'liars_party':
      art = <LiarsPartyArt />
      break
    default:
      art = <GameIcon gameId={svgId} accentColor={accentColor} size={64} variant="sticker" />
  }
  return <div aria-hidden="true">{art}</div>
}
