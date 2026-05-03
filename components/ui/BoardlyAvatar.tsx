const COLOR_MAP = {
  coral: { bg: 'var(--bd-coral)', text: 'white' },
  mint:  { bg: 'var(--bd-mint)',  text: 'white' },
  sun:   { bg: 'var(--bd-sun)',   text: 'var(--bd-ink)' },
  lav:   { bg: 'var(--bd-lav)',   text: 'white' },
  sky:   { bg: 'var(--bd-sky)',   text: 'white' },
} as const

export type AvatarColor = keyof typeof COLOR_MAP

interface BoardlyAvatarProps {
  name: string
  color?: AvatarColor
  size?: number
  online?: boolean
  style?: React.CSSProperties
}

export default function BoardlyAvatar({ name, color = 'coral', size = 36, online = false, style }: BoardlyAvatarProps) {
  const { bg, text } = COLOR_MAP[color]
  const initial = name[0]?.toUpperCase() ?? '?'

  return (
    <div style={{ position: 'relative', flexShrink: 0, ...style }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: bg,
          color: text,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
          fontSize: Math.round(size * 0.42),
          border: '2px solid white',
          boxShadow: '0 0 0 2px var(--bd-ink)',
          fontFamily: 'var(--bd-font-display)',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {initial}
      </div>
      {online && (
        <div
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: Math.round(size * 0.32),
            height: Math.round(size * 0.32),
            borderRadius: '50%',
            background: 'var(--bd-mint-deep)',
            border: '2px solid white',
          }}
        />
      )}
    </div>
  )
}
