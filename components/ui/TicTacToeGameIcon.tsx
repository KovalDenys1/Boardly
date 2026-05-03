interface TicTacToeGameIconProps {
  className?: string
  floating?: boolean
  size?: number
}

export default function TicTacToeGameIcon({
  className = '',
  floating = false,
  size = 108,
}: TicTacToeGameIconProps) {
  const isSmall = size < 48
  const borderWidth = isSmall ? 2 : 3
  const shadowOffset = isSmall ? 2 : 3
  const gap = Math.max(isSmall ? 2 : 4, Math.round(size * 0.055))
  const padding = Math.max(isSmall ? 3 : 6, Math.round(size * 0.074))
  const fontSize = Math.max(isSmall ? 8 : 14, Math.round(size * 0.16))
  const borderRadius = Math.max(isSmall ? 7 : 10, Math.round(size * 0.11))
  const marks = ['X', '', 'O', '', 'X', '', 'O', '', 'X']

  return (
    <span
      className={`${floating ? 'bd-float ' : ''}${className}`.trim()}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
        gap,
        width: size,
        height: size,
        boxSizing: 'border-box',
        border: `${borderWidth}px solid var(--bd-ink)`,
        borderRadius,
        boxShadow: `${shadowOffset}px ${shadowOffset}px 0 var(--bd-ink)`,
        background: 'white',
        padding,
        overflow: 'hidden',
      }}
    >
      {marks.map((mark, index) => (
        <span
          key={`${mark}-${index}`}
          style={{
            color: mark === 'X' ? 'var(--bd-coral)' : 'var(--bd-lav-deep)',
            display: 'grid',
            fontFamily: 'var(--bd-font-display)',
            fontSize,
            fontWeight: 900,
            lineHeight: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            placeItems: 'center',
          }}
        >
          {mark}
        </span>
      ))}
    </span>
  )
}
