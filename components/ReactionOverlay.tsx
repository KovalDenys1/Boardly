'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase-client'

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
  lobbyCode: string
}

export function ReactionOverlay({ lobbyCode }: ReactionOverlayProps) {
  const [reactions, setReactions] = useState<FloatingReaction[]>([])

  useEffect(() => {
    if (!lobbyCode) return

    const supabase = getSupabaseClient()
    const timeouts: ReturnType<typeof setTimeout>[] = []

    const channel = supabase
      .channel(`reactions:${lobbyCode}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const data = payload as ReactionPayload
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
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
      timeouts.forEach(clearTimeout)
    }
  }, [lobbyCode])

  return (
    <>
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
