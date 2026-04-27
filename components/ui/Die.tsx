const DICE_PATTERNS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

interface DieProps {
  value?: number
  size?: number
  held?: boolean
  animationDelay?: string
  rotate?: string
  className?: string
}

export default function Die({ value = 5, size = 56, held = false, animationDelay, rotate, className = '' }: DieProps) {
  const pips = DICE_PATTERNS[value] ?? [4]
  const pipSize = Math.round(size * 0.13)
  const radius = Math.round(size * 0.21)

  return (
    <div
      className={className}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        background: held ? '#FFC44D' : 'white',
        border: '2px solid #1F1B16',
        borderRadius: radius,
        width: size,
        height: size,
        boxShadow: '0 4px 0 #1F1B16',
        flexShrink: 0,
        transform: held ? `translateY(-4px) rotate(-3deg)` : rotate ? `rotate(${rotate})` : undefined,
        animationDelay,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          width: '70%',
          height: '70%',
          gap: Math.round(size * 0.07),
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: '#1F1B16',
              borderRadius: '50%',
              width: pipSize,
              height: pipSize,
              justifySelf: 'center',
              alignSelf: 'center',
              opacity: pips.includes(i) ? 1 : 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
