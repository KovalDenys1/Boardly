interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeStyles = {
    sm: { width: `clamp(14px, 1.4vw, 18px)`, height: `clamp(14px, 1.4vw, 18px)`, borderWidth: `clamp(1.5px, 0.15vw, 2.5px)` },
    md: { width: `clamp(28px, 2.8vw, 36px)`, height: `clamp(28px, 2.8vw, 36px)`, borderWidth: `clamp(2.5px, 0.25vw, 3.5px)` },
    lg: { width: `clamp(44px, 4.4vw, 56px)`, height: `clamp(44px, 4.4vw, 56px)`, borderWidth: `clamp(3px, 0.3vw, 5px)` },
  }

  return (
    <div
      className={`border-blue-600 border-t-transparent rounded-full animate-spin ${className}`}
      style={sizeStyles[size]}
      role="status"
      aria-label="Loading"
    />
  )
}
