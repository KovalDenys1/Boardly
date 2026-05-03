'use client'

import { useEffect, useState } from 'react'
import { Socket } from 'socket.io-client'
import { SocketEvents } from '@/types/socket-events'

const REACTION_DURATION_MS = 1600

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
    </>
  )
}
