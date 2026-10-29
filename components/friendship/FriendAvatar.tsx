import BoardlyAvatar, { type AvatarColor } from '@/components/ui/BoardlyAvatar'

const COLORS: readonly AvatarColor[] = ['coral', 'mint', 'sun', 'lav', 'sky']

function colorFor(name: string): AvatarColor {
  let sum = 0
  for (const char of name) sum += char.charCodeAt(0)
  return COLORS[sum % COLORS.length]
}

interface FriendAvatarProps {
  name: string
  src: string | null | undefined
  online?: boolean
  size?: number
}

/** A picture in BoardlyAvatar's frame, or BoardlyAvatar's initials when there is no picture. */
export default function FriendAvatar({ name, src, online = false, size = 44 }: FriendAvatarProps) {
  if (!src) return <BoardlyAvatar name={name} color={colorFor(name)} size={size} online={online} />

  const dot = Math.round(size * 0.32)
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- avatars are user uploads and presets of any origin */}
      <img src={src} alt="" width={size} height={size} className="bd-avatar h-full w-full bg-bd-bg2 object-cover" />
      {online && (
        <span
          aria-hidden
          className="absolute rounded-full bg-bd-mint-deep"
          style={{ width: dot, height: dot, bottom: -2, right: -2, border: '2px solid white' }}
        />
      )}
    </span>
  )
}
