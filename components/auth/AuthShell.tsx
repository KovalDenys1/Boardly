import type { ReactNode } from 'react'

/**
 * The one frame every /auth page sits in, taken from LoginForm (#1254).
 *
 * Login and register moved to the bd-* design; forgot-password, reset-password and
 * delete-account kept the old dark slate card for months because each page carried its own
 * copy of the frame. They share this one now, so the next restyle happens in one place.
 */

export const AUTH_BACKGROUND =
  'radial-gradient(circle at 12% 8%, rgba(255,196,77,0.18), transparent 35%), radial-gradient(circle at 88% 14%, rgba(155,140,255,0.16), transparent 40%), radial-gradient(circle at 50% 100%, rgba(79,201,166,0.14), transparent 50%), var(--bd-bg)'

type AuthShellProps = {
  kicker?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  /** Content under the heading; wrapped in a bd-card unless `bare` is set. */
  children: ReactNode
  bare?: boolean
}

export default function AuthShell({ kicker, title, subtitle, children, bare = false }: AuthShellProps) {
  return (
    <div
      className="bd-screen"
      style={{ minHeight: '100svh', overflowX: 'hidden', overflowY: 'auto', background: AUTH_BACKGROUND }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: '0 auto',
          minHeight: '100svh',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 'clamp(24px, 5vw, 40px) clamp(16px, 4vw, 32px)',
        }}
      >
        {kicker && <span className="bd-kicker">{kicker}</span>}
        {title && (
          <h1
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontWeight: 800,
              fontSize: 'clamp(34px, 8vw, 48px)',
              lineHeight: 1.05,
              marginTop: 8,
              marginBottom: 12,
              letterSpacing: '-0.02em',
              color: 'var(--bd-ink)',
            }}
          >
            {title}
          </h1>
        )}
        {subtitle && <p style={{ color: 'var(--bd-ink-soft)', fontSize: 16, marginBottom: 24 }}>{subtitle}</p>}
        {bare ? (
          children
        ) : (
          <div className="bd-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/** The loading state of an auth page, in the same frame. */
export function AuthShellLoading({ spinner }: { spinner: ReactNode }) {
  return (
    <AuthShell>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>{spinner}</div>
    </AuthShell>
  )
}
