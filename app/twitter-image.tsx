import { ImageResponse } from 'next/og'

// Route segment config
export const runtime = 'edge'

// Image metadata (Twitter summary_large_image format)
export const alt = 'Boardly - Play Board Games Online with Friends'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Image generation (same as OG image for consistency)
export default async function Image() {
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
        {/* Background pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.1) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255, 255, 255, 0.1) 2%, transparent 0%)',
            backgroundSize: '100px 100px',
            opacity: 0.3,
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px',
            zIndex: 1,
          }}
        >
          {/* Emoji/Icon */}
          <div
            style={{
              fontSize: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              width: '200px',
              height: '200px',
              backdropFilter: 'blur(10px)',
            }}
          >
            🎲
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: 'white',
              textAlign: 'center',
              letterSpacing: '-2px',
              textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            Boardly
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '36px',
              color: 'rgba(255, 255, 255, 0.95)',
              textAlign: 'center',
              maxWidth: '900px',
              lineHeight: 1.4,
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            Play Board Games Online with Friends
          </div>

          {/* Features */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              marginTop: '24px',
            }}
          >
            {['🎯 Real-time', '🤖 AI Opponents', '🎮 Free to Play'].map((feature) => (
              <div
                key={feature}
                style={{
                  fontSize: '24px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '12px 24px',
                  borderRadius: '50px',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                {feature}
              </div>
            ))}
          </div>

          {/* URL */}
          <div
            style={{
              fontSize: '28px',
              color: 'rgba(255, 255, 255, 0.85)',
              marginTop: '32px',
              fontWeight: '500',
            }}
          >
            www.boardly.online
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
