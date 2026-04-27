import Link from 'next/link'
import BoardlyAvatar from '@/components/ui/BoardlyAvatar'

export default function CtaBanner() {
  return (
    <section style={{ padding: '40px clamp(16px, 4vw, 48px) 80px', maxWidth: 1280, margin: '0 auto' }}>
      <div
        style={{
          background: '#1F1B16',
          color: '#FBF6EE',
          borderRadius: 36,
          padding: 'clamp(36px, 6vw, 56px) clamp(28px, 5vw, 64px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          alignItems: 'center',
          gap: 48,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: '#FF6B5B',
            opacity: 0.4,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            right: 120,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: '#FFC44D',
            opacity: 0.3,
            pointerEvents: 'none',
          }}
        />

        {/* text */}
        <div style={{ position: 'relative' }}>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque', Georgia, serif",
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: 16,
              letterSpacing: '-0.03em',
            }}
          >
            Ready?<br />Your friends are waiting.
          </h2>
          <p
            style={{
              fontSize: 17,
              color: 'rgba(251,246,238,0.7)',
              marginBottom: 28,
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            Sign up in 20 seconds. Use Google, GitHub, or play as a guest.
          </p>
          <Link
            href="/auth/register"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '16px 28px',
              borderRadius: 16,
              fontWeight: 700,
              fontSize: 17,
              background: '#FF6B5B',
              color: 'white',
              textDecoration: 'none',
              boxShadow: '0 4px 0 #E04B3B',
            }}
          >
            Create account
          </Link>
        </div>

        {/* avatars */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            position: 'relative',
            gap: 0,
          }}
        >
          {(
            [
              { name: 'Anna', color: 'coral' },
              { name: 'Max',  color: 'mint'  },
              { name: 'Liz',  color: 'sun'   },
              { name: 'Ivan', color: 'lav'   },
            ] as const
          ).map((a, i) => (
            <BoardlyAvatar
              key={a.name}
              name={a.name}
              color={a.color}
              size={64}
              style={{ marginLeft: i === 0 ? 0 : -16 }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
