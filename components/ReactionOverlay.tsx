'use client'

import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { SocketEvents } from '@/types/socket-events'

const ALLOWED_EMOJIS = ['👍', '😂', '😮', '🎉', '🔥'] as const
type AllowedEmoji = typeof ALLOWED_EMOJIS[number]

const REACTION_DURATION_MS = 1600
const CLIENT_THROTTLE_MS = 3000

interface FloatingReaction {
  id: string
  emoji: string
  username: string
  x: number // percent of screen width, 25–75
}

interface ReactionPayload {
  id: string
  userId: string
  username: string
  emoji: string
  timestamp: number
}

interface ReactionOverlayProps {
  socket: Socket | null
  lobbyCode: string
}

export function ReactionOverlay({ socket, lobbyCode }: ReactionOverlayProps) {
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [disabledEmoji, setDisabledEmoji] = useState<AllowedEmoji | null>(null)
  const lastSentAtRef = useRef<number>(0)

  useEffect(() => {
    if (!socket) return

    const timeouts: ReturnType<typeof setTimeout>[] = []

    const handler = (data: ReactionPayload) => {
      if (!data?.id || !data?.emoji || !data?.username) return
      setReactions((prev) => [
        ...prev,
        {
          id: data.id,
          emoji: data.emoji,
          username: data.username,
          x: 25 + Math.random() * 50,
        },
      ])
      const t = setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== data.id))
      }, REACTION_DURATION_MS)
      timeouts.push(t)
    }

    socket.on(SocketEvents.REACTION, handler)
    return () => {
      socket.off(SocketEvents.REACTION, handler)
      timeouts.forEach(clearTimeout)
    }
  }, [socket])

  const sendReaction = (emoji: AllowedEmoji) => {
    if (!socket || disabledEmoji) return
    const now = Date.now()
    if (now - lastSentAtRef.current < CLIENT_THROTTLE_MS) return
    lastSentAtRef.current = now
    socket.emit(SocketEvents.SEND_REACTION, { lobbyCode, emoji })
    setDisabledEmoji(emoji)
    setTimeout(() => setDisabledEmoji(null), CLIENT_THROTTLE_MS)
  }

  return (
    <>
      {/* Floating reactions */}
      {reactions.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none fixed z-40 flex flex-col items-center gap-0.5 animate-reaction-float"
          style={{ left: `${r.x}%`, bottom: '80px' }}
        >
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white/90 leading-none">
            {r.username}
          </span>
          <span className="text-[28px] leading-none">{r.emoji}</span>
        </div>
      ))}

      {/* Reaction bar */}
      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div className="flex gap-1 rounded-full bg-black/50 px-3 py-2 backdrop-blur-sm">
          {ALLOWED_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              disabled={!!disabledEmoji}
              aria-label={`React with ${emoji}`}
              className={`rounded-full px-1.5 py-0.5 text-[22px] transition-all duration-150 hover:scale-125 active:scale-110 disabled:cursor-not-allowed ${
                disabledEmoji ? 'opacity-50' : 'opacity-100'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
