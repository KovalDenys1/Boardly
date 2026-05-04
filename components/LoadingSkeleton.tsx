interface LoadingSkeletonProps {
  className?: string
  type?: 'text' | 'card' | 'avatar' | 'button'
  lines?: number
}

export default function LoadingSkeleton({
  className = '',
  type = 'text',
  lines = 1
}: LoadingSkeletonProps) {
  const baseClass = 'animate-pulse rounded'
  const baseStyle = { background: 'var(--bd-line)' }
  const darkerStyle = { background: '#D4C9B0' }

  if (type === 'text') {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} h-4 ${className}`}
            style={{ ...baseStyle, width: i === lines - 1 ? '80%' : '100%' }}
          />
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div className={`${baseClass} p-6 ${className}`} style={baseStyle}>
        <div className="h-6 rounded w-1/3 mb-4" style={darkerStyle} />
        <div className="space-y-2">
          <div className="h-4 rounded w-full" style={darkerStyle} />
          <div className="h-4 rounded w-5/6" style={darkerStyle} />
        </div>
      </div>
    )
  }

  if (type === 'avatar') {
    return <div className={`${baseClass} w-12 h-12 rounded-full ${className}`} style={baseStyle} />
  }

  if (type === 'button') {
    return <div className={`${baseClass} h-10 w-24 ${className}`} style={baseStyle} />
  }

  return <div className={`${baseClass} ${className}`} style={baseStyle} />
}
