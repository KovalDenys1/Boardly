import type { ReactElement } from 'react'

import type { SocialCard } from './social-preview'

/**
 * The 1200×630 link-preview card (#1091), in the same paper-and-ink style as the
 * root `app/opengraph-image.tsx`. Satori renders it, so every element with more
 * than one child is `display: flex` and nothing depends on a CSS variable.
 *
 * Text is set large on purpose: a WhatsApp or Messenger preview shows this image
 * at roughly a third of its size, and a subtitle under ~28px is unreadable there.
 */

const INK = '#1F1B16'
const PAPER = '#FBF6EE'
const PAPER_2 = '#F2E9D8'
const MUTED = '#4A3F33'
const FAINT = '#8A7A66'

function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export function renderSocialCard(card: Pick<SocialCard, 'eyebrow' | 'title' | 'subtitle' | 'accent' | 'chips'>): ReactElement {
  const title = clamp(card.title, 60)
  const titleSize = title.length > 34 ? 64 : 84

  return (
    <div
      style={{
        background: PAPER,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px 52px',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, #1F1B1618 1.5px, transparent 1.5px)',
          backgroundSize: '32px 32px',
          display: 'flex',
        }}
      />
      <div style={{ position: 'absolute', top: -120, right: -120, width: 420, height: 420, borderRadius: '50%', background: `${card.accent}33`, display: 'flex' }} />
      <div style={{ position: 'absolute', bottom: -90, left: -90, width: 300, height: 300, borderRadius: '50%', background: '#FFC44D22', display: 'flex' }} />

      {/* Brand row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 17,
            background: INK,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '5px 5px 0 #FF6B5B',
          }}
        >
          <span style={{ fontSize: 44, fontWeight: 900, color: '#FFC44D', lineHeight: 1 }}>B</span>
        </div>
        <div style={{ fontSize: 44, fontWeight: 900, color: INK, letterSpacing: '-2px', display: 'flex' }}>boardly</div>
      </div>

      {/* Copy */}
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: card.accent, display: 'flex' }} />
          <div style={{ fontSize: 28, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '2px', display: 'flex' }}>
            {clamp(card.eyebrow, 40)}
          </div>
        </div>
        <div style={{ fontSize: titleSize, fontWeight: 900, color: INK, letterSpacing: '-3px', lineHeight: 1.05, marginBottom: 22, display: 'flex' }}>
          {title}
        </div>
        <div style={{ fontSize: 30, color: MUTED, lineHeight: 1.35, display: 'flex' }}>{clamp(card.subtitle, 140)}</div>
      </div>

      {/* Chips + domain */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {card.chips.slice(0, 4).map((chip) => (
            <div
              key={chip}
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: INK,
                background: PAPER_2,
                padding: '10px 22px',
                borderRadius: 999,
                border: `2px solid ${INK}22`,
                display: 'flex',
              }}
            >
              {clamp(chip, 24)}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: FAINT, display: 'flex' }}>boardly.online</div>
      </div>
    </div>
  )
}
