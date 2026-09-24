import type { CSSProperties, ReactNode, SVGProps } from 'react'

/**
 * Game icons – one glyph per game on a 48×48 grid, in the same language as
 * the chrome icons (components/icons) and the B-tile brand mark: filled,
 * rounded, chunky. Two colours only: the main shape in `currentColor` and
 * details (pips, eyes, teeth) in `--gi-detail`, which GameIcon sets per
 * variant so the same glyph works tinted, bare, or as an ink-on-accent
 * sticker. Never a hex value here – dark mode and the premium lobby
 * themes swap the tokens underneath.
 *
 * Adding a game: add its glyph under the catalog `id` (= `svgId`), keep
 * inside the 4px safe margin, check it on /dev/icons at 24 / 40 / 72.
 */

const D: CSSProperties = { fill: 'var(--gi-detail)' }
const DS: CSSProperties = { stroke: 'var(--gi-detail)', fill: 'none' }
/** Ink outline around the main shapes – what makes the glyph read as drawn, not generated. */
const O: CSSProperties = { stroke: 'var(--gi-outline)', strokeWidth: 2, strokeLinejoin: 'round' }
/** Soft highlight on the main shape. */
const SH: CSSProperties = { fill: 'var(--gi-shine)' }

function Line(props: SVGProps<SVGPathElement>) {
  return <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props} />
}

export const GAME_GLYPHS: Record<string, ReactNode> = {
  yahtzee: (
    <g transform="translate(1 0)">
    <>
      <g transform="rotate(-14 16 18)" opacity={0.6}>
        <rect x={5} y={7} width={22} height={22} rx={6} style={O} />
        <circle cx={16} cy={18} r={2.4} style={D} />
      </g>
      <g transform="rotate(8 29 29)">
        <rect x={16} y={16} width={26} height={26} rx={7} style={O} />
        <rect x={19.5} y={19.5} width={7} height={3} rx={1.5} style={SH} />
        <circle cx={23} cy={23} r={2.6} style={D} />
        <circle cx={35} cy={23} r={2.6} style={D} />
        <circle cx={29} cy={29} r={2.6} style={D} />
        <circle cx={23} cy={35} r={2.6} style={D} />
        <circle cx={35} cy={35} r={2.6} style={D} />
      </g>
    </>
    </g>
  ),
  spy: (
    <g transform="translate(0 -1)">
    <>
      <circle cx={24} cy={32} r={11} style={O} />
      <rect x={13} y={7} width={22} height={14} rx={5} style={O} />
      <rect x={13} y={15.5} width={22} height={4} style={D} />
      <rect x={5} y={18.5} width={38} height={6} rx={3} style={O} />
      <rect x={16} y={9.5} width={6} height={2.5} rx={1.25} style={SH} />
      <rect x={12.5} y={28} width={9.5} height={6} rx={3} style={D} />
      <rect x={26} y={28} width={9.5} height={6} rx={3} style={D} />
      <rect x={21.5} y={29.5} width={5} height={2.4} rx={1.2} style={D} />
    </>
    </g>
  ),
  'tic-tac-toe': (
    <>
      <rect x={5} y={5} width={38} height={38} rx={8} style={O} />
      <rect x={17} y={8} width={2.6} height={32} rx={1.3} style={D} />
      <rect x={28.4} y={8} width={2.6} height={32} rx={1.3} style={D} />
      <rect x={8} y={17} width={32} height={2.6} rx={1.3} style={D} />
      <rect x={8} y={28.4} width={32} height={2.6} rx={1.3} style={D} />
      <path d="M8.5 8.5l6 6M14.5 8.5l-6 6" strokeWidth={2.4} strokeLinecap="round" style={DS} />
      <circle cx={24} cy={24} r={2.5} strokeWidth={2.2} style={DS} />
      <path d="M33.5 33.5l6 6M39.5 33.5l-6 6" strokeWidth={2.4} strokeLinecap="round" style={DS} />
    </>
  ),
  memory: (
    <>
      <g transform="rotate(-12 17.5 21.5)">
        <rect x={7} y={7} width={21} height={29} rx={4.5} style={O} />
        <path d="M14 15.5a3.5 3.5 0 1 1 5 3.2c-1.2.7-1.8 1.5-1.8 2.9" strokeWidth={2.4} strokeLinecap="round" style={DS} />
        <circle cx={17.2} cy={25.6} r={1.6} style={D} />
      </g>
      <g transform="rotate(10 30.5 26.5)">
        <rect x={20} y={12} width={21} height={29} rx={4.5} style={O} />
        <rect x={23} y={15} width={6} height={2.6} rx={1.3} style={SH} />
        <path d="M30.5 31c-1-1-5.5-3.7-5.5-7a3 3 0 0 1 5.5-1.7A3 3 0 0 1 36 24c0 3.3-4.5 6-5.5 7z" style={D} />
      </g>
    </>
  ),
  rps: (
    <g transform="translate(0 1.3)">
    <>
      <g transform="rotate(-32 24 22)">
        <rect x={21} y={2} width={6} height={27} rx={3} style={O} />
      </g>
      <g transform="rotate(32 24 22)">
        <rect x={21} y={2} width={6} height={27} rx={3} style={O} />
      </g>
      <circle cx={14.5} cy={36} r={6} fill="none" strokeWidth={8} style={{ stroke: 'var(--gi-outline)' }} />
      <circle cx={33.5} cy={36} r={6} fill="none" strokeWidth={8} style={{ stroke: 'var(--gi-outline)' }} />
      <circle cx={14.5} cy={36} r={6} fill="none" stroke="currentColor" strokeWidth={4.5} />
      <circle cx={33.5} cy={36} r={6} fill="none" stroke="currentColor" strokeWidth={4.5} />
      <circle cx={24} cy={22} r={2.6} style={D} />
    </>
    </g>
  ),
  'connect-four': (
    <g transform="translate(0 -2.5)">
    <>
      <rect x={9} y={38} width={7} height={6} rx={2} style={O} />
      <rect x={32} y={38} width={7} height={6} rx={2} style={O} />
      <rect x={5} y={9} width={38} height={31} rx={7} style={O} />
      <rect x={9} y={12} width={7} height={2.6} rx={1.3} style={SH} />
      {[14.5, 24, 33.5].map((cx) =>
        [17.5, 24.5, 31.5].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.4} style={D} />)
      )}
      <circle cx={14.5} cy={31.5} r={1.9} />
      <circle cx={24} cy={24.5} r={1.9} />
      <circle cx={33.5} cy={17.5} r={1.9} />
    </>
    </g>
  ),
  checkers: (
    <>
      <g opacity={0.6}>
        <circle cx={18} cy={18} r={12} style={O} />
        <circle cx={18} cy={18} r={7.5} strokeWidth={2.4} style={DS} />
      </g>
      <circle cx={29} cy={29} r={14} style={O} />
      <rect x={20} y={18.5} width={7} height={2.6} rx={1.3} transform="rotate(-35 23.5 19.8)" style={SH} />
      <circle cx={29} cy={29} r={9.5} strokeWidth={2.4} style={DS} />
      <path d="M22.8 33h12.4l1.3-7.6-4.3 3.1L29 23.4l-3.2 5.1-4.3-3.1z" strokeLinejoin="round" style={D} />
    </>
  ),
  'guess-my-drawing': (
    <g transform="translate(-0.9 0.9) rotate(45 24 24)">
      <rect x={19.5} y={2} width={9} height={6} rx={2.2} style={O} />
      <rect x={19.5} y={9} width={9} height={24} style={O} />
      <rect x={19.5} y={12} width={9} height={3.2} style={D} />
      <rect x={21} y={17} width={2.4} height={12} rx={1.2} style={SH} />
      <path d="M19.5 33h9L24 43.5z" style={O} />
      <path d="M22.3 39.6h3.4L24 43.5z" style={D} />
    </g>
  ),
  'fake-artist': (
    <>
      <path d="M24 8c11 0 20 7.2 20 16 0 3.6-2.7 6.4-6.2 6.4h-2.6c-1.9 0-3.1 1.7-2.5 3.5.8 2.3-.6 4.6-3 5.1-1.8.4-3.7.6-5.7.6C13 39.6 4 32.8 4 24S13 8 24 8z" style={O} />
      <rect x={6.5} y={16.5} width={6} height={2.8} rx={1.4} transform="rotate(-42 9.5 17.9)" style={SH} />
      <circle cx={12.5} cy={25} r={3.4} style={D} />
      <circle cx={17} cy={17} r={3.4} style={D} />
      <circle cx={26} cy={14.5} r={3.4} style={D} />
      <circle cx={34.5} cy={19} r={3.4} style={D} />
      <circle cx={24} cy={26.5} r={2.4} style={D} />
    </>
  ),
  'telephone-doodle': (
    <>
      <path d="M12 21Q12 34.5 28 34.5" fill="none" strokeWidth={10} strokeLinecap="round" style={{ stroke: 'var(--gi-outline)' }} />
      <path d="M12 21Q12 34.5 28 34.5" fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" />
      <rect x={6} y={6} width={12} height={16} rx={6} style={O} />
      <rect x={28} y={26} width={13} height={16} rx={6.5} style={O} />
      <rect x={8.5} y={8.5} width={4} height={2.4} rx={1.2} style={SH} />
      <circle cx={12} cy={13} r={2.4} style={D} />
      <circle cx={34.5} cy={35} r={2.4} style={D} />
      <circle cx={36} cy={12} r={7} style={O} />
      <circle cx={33} cy={12} r={1.3} style={D} />
      <circle cx={36} cy={12} r={1.3} style={D} />
      <circle cx={39} cy={12} r={1.3} style={D} />
    </>
  ),
  'words-mines': (
    <g transform="translate(-3 2)">
    <>
      <circle cx={21} cy={28} r={14.5} style={O} />
      <rect x={12} y={19.5} width={6} height={3} rx={1.5} transform="rotate(-40 15 21)" style={SH} />
      <rect x={28} y={11.5} width={9} height={6} rx={2} transform="rotate(-45 32.5 14.5)" style={O} />
      <path d="M35 12c1-3.5 3.5-5.5 7-5.5" fill="none" strokeWidth={7.5} strokeLinecap="round" style={{ stroke: 'var(--gi-outline)' }} />
      <path d="M35 12c1-3.5 3.5-5.5 7-5.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      <path d="M42.5 1.5l1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3z" style={O} />
    </>
    </g>
  ),
  anagrams: (
    <g transform="translate(0 3.5)">
    <>
      <rect x={4} y={22} width={12.5} height={12.5} rx={3} style={O} />
      <rect x={17.75} y={13} width={12.5} height={12.5} rx={3} style={O} />
      <rect x={31.5} y={22} width={12.5} height={12.5} rx={3} style={O} />
      <rect x={17.75} y={27} width={12.5} height={12.5} rx={3} style={O} />
      <rect x={20} y={15.2} width={4.5} height={2.2} rx={1.1} style={SH} />
      <circle cx={10.25} cy={28.25} r={2.6} style={D} />
      <rect x={21.5} y={16.75} width={5} height={5} rx={1} style={D} />
      <path d="M37.75 25l3.2 5.5h-6.4z" style={D} />
      <rect x={21.5} y={31} width={5} height={5} rx={2.5} style={D} />
      <path d="M13 9.5c3-4.5 7.5-6 12.5-5" fill="none" strokeWidth={7} strokeLinecap="round" style={{ stroke: 'var(--gi-outline)' }} />
      <path d="M13 9.5c3-4.5 7.5-6 12.5-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <path d="M26.5 1.5l4 4.5-6 1.2z" style={O} />
    </>
    </g>
  ),
  crocodile: (
    <g transform="translate(0 1.5)">
    <>
      <rect x={4} y={14} width={40} height={11} rx={5.5} style={O} />
      <rect x={9} y={30} width={35} height={8} rx={4} style={O} />
      <circle cx={13} cy={12.5} r={5.5} style={O} />
      <circle cx={13.8} cy={12} r={2} style={D} />
      <rect x={8} y={16.5} width={6} height={2.4} rx={1.2} style={SH} />
      <circle cx={39} cy={19} r={1.5} style={D} />
      {[19, 25, 31, 37].map((x) => (
        <path key={x} d={`M${x} 25h5l-2.5 4.5z`} style={D} />
      ))}
    </>
    </g>
  ),
  alias: (
    <>
      <g opacity={0.6}>
        <rect x={4} y={5} width={24} height={17} rx={7} style={O} />
        <circle cx={12} cy={13.5} r={2} style={D} />
        <circle cx={19.5} cy={13.5} r={2} style={D} />
      </g>
      <path d="M21 15h16a7 7 0 0 1 7 7v7a7 7 0 0 1-7 7H25l-6.5 6.5V36H21a7 7 0 0 1-7-7v-7a7 7 0 0 1 7-7z" style={O} />
      <rect x={18} y={18.5} width={7} height={2.6} rx={1.3} style={SH} />
      <rect x={19.5} y={23} width={18} height={3} rx={1.5} style={D} />
      <rect x={19.5} y={29} width={11} height={3} rx={1.5} style={D} />
    </>
  ),
  'liars-party': (
    <>
      <g transform="rotate(-14 19 23)" opacity={0.6}>
        <rect x={9} y={9} width={20} height={28} rx={4} style={O} />
        <circle cx={19} cy={23} r={3} style={D} />
      </g>
      <g transform="rotate(10 29 25)">
        <rect x={19} y={11} width={20} height={28} rx={4} style={O} />
        <rect x={22} y={14} width={6} height={2.6} rx={1.3} style={SH} />
        <path d="M29 17.5c-2.5 3.5-6.5 6.5-6.5 10a3.8 3.8 0 0 0 6 3c-.3 1.6-1 2.8-2 3.5h5c-1-.7-1.7-1.9-2-3.5a3.8 3.8 0 0 0 6-3c0-3.5-4-6.5-6.5-10z" style={D} />
        <circle cx={22.8} cy={15.5} r={1.5} style={D} />
        <circle cx={35.2} cy={34.5} r={1.5} style={D} />
      </g>
    </>
  ),
  'alibi-night': (
    <g transform="translate(0.5 0.5)">
      <path d="M29.5 29.5l10 10" fill="none" strokeWidth={11} strokeLinecap="round" style={{ stroke: 'var(--gi-outline)' }} />
      <path d="M29.5 29.5l10 10" fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
      <circle cx={20.5} cy={20.5} r={12.5} fill="none" strokeWidth={9.5} style={{ stroke: 'var(--gi-outline)' }} />
      <circle cx={20.5} cy={20.5} r={12.5} fill="none" stroke="currentColor" strokeWidth={5.5} />
      <path d="M12.5 17a9 9 0 0 1 4.5-5.2" fill="none" strokeWidth={2.4} strokeLinecap="round" style={{ stroke: 'var(--gi-shine)' }} />
      <path d="M21.5 15.5a5 5 0 1 0 3 9 3.7 3.7 0 0 1-3-9z" transform="rotate(-25 20.5 20.5)" style={D} />
    </g>
  ),
}

export const GAME_ICON_IDS = Object.keys(GAME_GLYPHS)

export type GameIconVariant = 'tile' | 'bare' | 'sticker'

interface GameGlyphProps {
  gameId: string
  size: number
  color: string
  detailColor: string
  /** Colour of the ink outline around the main shapes; 'transparent' inside a sticker. */
  outlineColor?: string
  shineColor?: string
  label?: string
  className?: string
  style?: CSSProperties
}

/** The bare svg – use through GameIcon unless you are building a new frame. */
export function GameGlyph({
  gameId,
  size,
  color,
  detailColor,
  outlineColor = detailColor,
  shineColor = 'rgba(255,255,255,0.55)',
  label,
  className,
  style,
}: GameGlyphProps) {
  const glyph = GAME_GLYPHS[gameId] ?? GAME_GLYPHS.yahtzee
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="currentColor"
      data-game-icon={gameId}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={className}
      style={
        {
          display: 'block',
          flexShrink: 0,
          color,
          ['--gi-detail' as string]: detailColor,
          ['--gi-outline' as string]: outlineColor,
          ['--gi-shine' as string]: shineColor,
          ...style,
        } as CSSProperties
      }
    >
      {glyph}
    </svg>
  )
}

interface GameIconProps {
  gameId: string
  /** A token: 'var(--bd-sky)'. Tile/bare colour the glyph with it; sticker uses it as the tile fill. */
  accentColor: string
  /** Glyph size in px. The tile/sticker frame adds 24px around it. */
  size?: number
  variant?: GameIconVariant
  /** Override the detail colour (defaults to ink, or the accent inside a sticker). */
  detailColor?: string
  label?: string
  className?: string
}

export default function GameIcon({
  gameId,
  accentColor,
  size = 40,
  variant = 'tile',
  detailColor,
  label,
  className,
}: GameIconProps) {
  if (variant === 'bare') {
    return (
      <GameGlyph
        gameId={gameId}
        size={size}
        color={accentColor}
        detailColor={detailColor ?? 'var(--bd-ink)'}
        label={label}
        className={className}
      />
    )
  }

  const box = size + 24

  if (variant === 'sticker') {
    const lift = Math.max(3, Math.round(box * 0.06))
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: box,
          height: box,
          borderRadius: Math.round(box * 0.27),
          background: accentColor,
          border: '2.5px solid var(--bd-ink)',
          boxShadow: `${lift}px ${lift}px 0 var(--bd-ink)`,
          transform: 'rotate(-6deg)',
        }}
      >
        <GameGlyph
          gameId={gameId}
          size={size}
          color="var(--bd-ink)"
          detailColor={detailColor ?? accentColor}
          outlineColor="transparent"
          shineColor="rgba(255,255,255,0.28)"
          label={label}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-2xl ${className ?? ''}`}
      style={{
        width: box,
        height: box,
        background: `color-mix(in srgb, ${accentColor} 15%, transparent)`,
      }}
    >
      <GameGlyph
        gameId={gameId}
        size={size}
        color={accentColor}
        detailColor={detailColor ?? 'var(--bd-ink)'}
        label={label}
      />
    </div>
  )
}
