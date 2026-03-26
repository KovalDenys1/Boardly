import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getGameMetadata } from '@/lib/game-catalog'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  let gameName = 'Board Game'
  let gameIcon = '🎲'
  let hostName = 'Host'
  let playerCount = 0
  let maxPlayers = 4
  let found = false

  try {
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        gameType: true,
        maxPlayers: true,
        isActive: true,
        creator: { select: { username: true } },
        games: {
          where: { status: 'waiting' },
          select: { _count: { select: { players: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (lobby && lobby.isActive) {
      found = true
      const meta = getGameMetadata(lobby.gameType)
      if (meta) {
        gameName = meta.name
        gameIcon = meta.icon
      }
      hostName = lobby.creator?.username || 'Host'
      maxPlayers = lobby.maxPlayers
      playerCount = lobby.games[0]?._count?.players ?? 0
    }
  } catch {
    // fallback to generic card
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* dot pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle at 25px 25px, rgba(255,255,255,0.1) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255,255,255,0.1) 2%, transparent 0%)',
            backgroundSize: '100px 100px',
            opacity: 0.3,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '28px',
            zIndex: 1,
            padding: '0 80px',
          }}
        >
          {/* game icon */}
          <div
            style={{
              fontSize: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '50%',
              width: '180px',
              height: '180px',
            }}
          >
            {gameIcon}
          </div>

          {/* headline */}
          <div
            style={{
              fontSize: '64px',
              fontWeight: 'bold',
              color: 'white',
              textAlign: 'center',
              letterSpacing: '-1px',
              textShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {found ? `Join ${gameName}` : 'Join a Game'}
          </div>

          {/* sub-info */}
          {found ? (
            <div style={{ display: 'flex', gap: '32px' }}>
              <div
                style={{
                  fontSize: '26px',
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.15)',
                  padding: '12px 28px',
                  borderRadius: '50px',
                  border: '1px solid rgba(255,255,255,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                👤 {hostName}
              </div>
              <div
                style={{
                  fontSize: '26px',
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.15)',
                  padding: '12px 28px',
                  borderRadius: '50px',
                  border: '1px solid rgba(255,255,255,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                🧑‍🤝‍🧑 {playerCount}/{maxPlayers} players
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: '32px',
                color: 'rgba(255,255,255,0.75)',
                textAlign: 'center',
              }}
            >
              Play Board Games Online with Friends
            </div>
          )}

          {/* branding */}
          <div
            style={{
              fontSize: '24px',
              color: 'rgba(255,255,255,0.7)',
              fontWeight: '500',
              marginTop: '12px',
            }}
          >
            boardly.online
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
