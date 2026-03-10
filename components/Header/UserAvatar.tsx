'use client'

import { useMemo, useState, type CSSProperties } from 'react'

type UserAvatarProps = {
  image?: string | null
  userName?: string | null
  userEmail?: string | null
  className?: string
  textClassName?: string
  style?: CSSProperties
}

export function UserAvatar({
  image,
  userName,
  userEmail,
  className = '',
  textClassName = '',
  style,
}: UserAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false)

  const fallbackLabel = useMemo(() => {
    const preferredLabel = userName?.trim() || userEmail?.trim() || 'User'
    const preferredInitial = preferredLabel.charAt(0).toUpperCase()

    return {
      alt: preferredLabel,
      initial: preferredInitial || '?',
    }
  }, [userEmail, userName])

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full ${className}`}
      style={style}
    >
      {image && !hasImageError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={fallbackLabel.alt}
          className="h-full w-full object-cover"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span className={textClassName}>{fallbackLabel.initial}</span>
      )}
    </div>
  )
}
