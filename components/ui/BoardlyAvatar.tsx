const COLOR_MAP = {
  coral: { bg: '#FF6B5B', text: 'white' },
  mint:  { bg: '#4FC9A6', text: 'white' },
  sun:   { bg: '#FFC44D', text: '#1F1B16' },
  lav:   { bg: '#9B8CFF', text: 'white' },
  sky:   { bg: '#6BC1F0', text: 'white' },
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
          boxShadow: '0 0 0 2px #1F1B16',
          fontFamily: "'Bricolage Grotesque', Georgia, serif",
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
            background: '#2FA787',
            border: '2px solid white',
          }}
        />
      )}
    </div>
  )
}
