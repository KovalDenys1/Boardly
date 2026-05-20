'use client'

export type PremiumCardStyle = 'gold' | 'glass' | 'holo' | 'dark'

export const PREMIUM_CARD_STYLES: { id: PremiumCardStyle; name: string; description: string }[] = [
  { id: 'gold',  name: 'Gold',        description: 'Rich gold gradients, italic serif, gilded ring' },
  { id: 'glass', name: 'Glass',       description: 'Frosted glass over Boardly colors' },
  { id: 'holo',  name: 'Holographic', description: 'Animated iridescent shimmer' },
  { id: 'dark',  name: 'Dark Glow',   description: 'Inky dark with mint accent glow' },
]

interface ProfileData {
  displayName: string
  handle: string
  bio?: string | null
  memberSince: string
  gamesPlayed: number
  level: number
}

function StatBlock({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 20, fontWeight: 600, color: color ?? 'inherit', letterSpacing: '-0.01em', lineHeight: 1 }}>
        {value}{sub && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 2 }}>{sub}</span>}
      </div>
      <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    </div>
  )
}

function GoldCard({ profile }: { profile: ProfileData }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 24,
      background: '#FAF2D8',
      border: '1px solid rgba(184,140,30,0.3)',
      boxShadow: '0 0 0 1px rgba(255,255,255,0.8) inset, 0 20px 38px -20px rgba(109,74,20,0.2)',
      padding: '22px 20px',
      color: '#3A2800',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* subtle dot texture */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.25,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(180,140,30,0.35) 1px, transparent 1px)',
        backgroundSize: '18px 18px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ position: 'relative', width: 72, height: 72 }}>
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #C9A020, #F0D060, #C9A020, #8A6A0A, #C9A020)',
          }} />
          <div style={{
            position: 'absolute', inset: 3, borderRadius: '50%',
            background: '#FAF2D8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Fraunces", Georgia, serif', fontWeight: 700, fontSize: 28, color: '#3A2800',
          }}>{profile.displayName.charAt(0).toUpperCase()}</div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 999,
          background: 'rgba(201,160,32,0.12)',
          border: '1px solid rgba(184,140,30,0.4)',
          fontFamily: '"Fraunces", Georgia, serif', fontStyle: 'italic',
          fontSize: 11, color: '#7A5800', display: 'flex', alignItems: 'center', gap: 5,
          letterSpacing: '0.04em',
        }}>
          <span>👑</span> Premium
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 600, color: '#3A2800', letterSpacing: '-0.01em', lineHeight: 1 }}>
          {profile.displayName}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(58,40,0,0.5)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
          Member since {profile.memberSince}
        </div>
      </div>
      {profile.bio && (
        <div style={{ fontSize: 13, color: 'rgba(58,40,0,0.65)', lineHeight: 1.45, fontStyle: 'italic', fontFamily: '"Fraunces", Georgia, serif' }}>
          &ldquo;{profile.bio}&rdquo;
        </div>
      )}
      <div style={{
        marginTop: 'auto',
        background: 'rgba(201,160,32,0.08)',
        border: '1px solid rgba(184,140,30,0.2)',
        borderRadius: 14, padding: '10px 12px',
        display: 'flex', justifyContent: 'space-between', color: '#3A2800',
      }}>
        <StatBlock label="Games"  value={profile.gamesPlayed} />
        <div style={{ width: 1, background: 'rgba(184,140,30,0.2)' }} />
        <StatBlock label="Level"  value={`Lv. ${profile.level}`} />
      </div>
    </div>
  )
}

function GlassCard({ profile }: { profile: ProfileData }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: 'linear-gradient(135deg, #FF6B5B 0%, #FFC44D 45%, #4FC9A6 100%)', padding: 16 }}>
      <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: '#8B7EC8', top: -36, right: -36, opacity: 0.8 }} />
      <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: '#4FC9A6', bottom: -26, left: -26, opacity: 0.75 }} />
      <div style={{ position: 'absolute', width: 100, height: 100, borderRadius: '50%', background: '#FFC44D', top: '42%', left: '36%', opacity: 0.75 }} />
      <div style={{
        position: 'relative',
        background: 'rgba(255,255,255,0.3)',
        backdropFilter: 'blur(26px) saturate(140%)',
        WebkitBackdropFilter: 'blur(26px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.52)',
        borderRadius: 18, padding: '18px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 26px -10px rgba(0,0,0,0.22)',
        color: '#1F1B16',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.6))',
              backdropFilter: 'blur(8px)',
              border: '2px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600, fontSize: 28, color: '#1F1B16',
              boxShadow: '0 5px 12px -5px rgba(0,0,0,0.22)',
            }}>{profile.displayName.charAt(0).toUpperCase()}</div>
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(255,255,255,0.95)', border: '2px solid rgba(255,255,255,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: '#FFC44D', boxShadow: '0 2px 5px rgba(0,0,0,0.16)',
            }}>✦</div>
          </div>
          <div style={{
            padding: '4px 9px', borderRadius: 999,
            background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.7)',
            fontSize: 10, fontWeight: 700, color: '#1F1B16', letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>Premium</div>
        </div>
        <div>
          <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 24, fontWeight: 600, color: '#1F1B16', letterSpacing: '-0.015em', lineHeight: 1 }}>{profile.displayName}</div>
          <div style={{ fontSize: 11, color: 'rgba(31,27,22,0.6)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Joined {profile.memberSince}</div>
        </div>
        {profile.bio && <div style={{ fontSize: 12, color: 'rgba(31,27,22,0.75)', lineHeight: 1.45 }}>{profile.bio}</div>}
        <div style={{
          marginTop: 'auto', background: 'rgba(255,255,255,0.38)', border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: 12, padding: '9px 11px', display: 'flex', justifyContent: 'space-between',
        }}>
          <StatBlock label="Games" value={profile.gamesPlayed} />
          <div style={{ width: 1, background: 'rgba(31,27,22,0.1)' }} />
          <StatBlock label="Level" value={`Lv. ${profile.level}`} />
        </div>
      </div>
    </div>
  )
}

function HoloCard({ profile }: { profile: ProfileData }) {
  return (
    <>
      <style>{`
        @keyframes bd-holo-shine { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
        @keyframes bd-holo-spin  { to { transform: rotate(360deg) } }
        .bd-holo-bg { background: linear-gradient(115deg, #B4F0FF 0%, #C9B8FF 20%, #FFB8E0 40%, #FFE3A8 60%, #B8FFD0 80%, #B4F0FF 100%); background-size: 240% 240%; animation: bd-holo-shine 9s ease-in-out infinite; }
        .bd-holo-ring { background: conic-gradient(from 0deg, #FF6B5B, #FFC44D, #4FC9A6, #8B7EC8, #FF6B5B); animation: bd-holo-spin 8s linear infinite; }
        .bd-holo-name { background: linear-gradient(115deg, #2D2266 0%, #8B3C7A 35%, #C2552A 65%, #2D2266 100%); background-size: 200% 200%; animation: bd-holo-shine 9s ease-in-out infinite; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
      `}</style>
      <div className="bd-holo-bg" style={{
        position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 20,
        boxShadow: '0 20px 34px -20px rgba(31,27,22,0.38)',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)', mixBlendMode: 'overlay' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 6px)', mixBlendMode: 'overlay' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ position: 'relative', width: 72, height: 72 }}>
              <div className="bd-holo-ring" style={{ position: 'absolute', inset: -3, borderRadius: '50%', filter: 'blur(0.5px)' }} />
              <div style={{
                position: 'absolute', inset: 3, borderRadius: '50%',
                background: 'linear-gradient(150deg, #fff, #F0EEF8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600, fontSize: 28, color: '#1F1B16',
                boxShadow: 'inset 0 0 0 2px #fff, 0 3px 8px rgba(0,0,0,0.16)',
              }}>{profile.displayName.charAt(0).toUpperCase()}</div>
            </div>
            <div style={{
              padding: '4px 9px 4px', borderRadius: 999,
              background: 'linear-gradient(115deg, rgba(255,255,255,0.82), rgba(255,255,255,0.52))',
              border: '1px solid rgba(255,255,255,0.88)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              boxShadow: '0 2px 5px rgba(31,27,22,0.16)',
            }}>
              <span style={{ background: 'linear-gradient(115deg, #FF6B5B, #8B7EC8, #4FC9A6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 800 }}>Holo · Premium</span>
            </div>
          </div>
          <div>
            <div className="bd-holo-name" style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1 }}>{profile.displayName}</div>
            <div style={{ fontSize: 10, color: 'rgba(31,27,22,0.6)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
              foiled · since {profile.memberSince}
            </div>
          </div>
          {profile.bio && (
            <div style={{ fontSize: 12, color: '#1F1B16', lineHeight: 1.45, background: 'rgba(255,255,255,0.42)', border: '1px solid rgba(255,255,255,0.68)', borderRadius: 10, padding: '8px 10px' }}>
              {profile.bio}
            </div>
          )}
          <div style={{
            marginTop: 'auto', background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.75)',
            borderRadius: 12, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', color: '#1F1B16',
          }}>
            <StatBlock label="Games" value={profile.gamesPlayed} />
            <div style={{ width: 1, background: 'rgba(31,27,22,0.1)' }} />
            <StatBlock label="Level" value={`Lv. ${profile.level}`} />
          </div>
        </div>
      </div>
    </>
  )
}

function DarkCard({ profile }: { profile: ProfileData }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 24,
      background: 'radial-gradient(circle at 20% 0%, #2A2522 0%, #16120E 70%)',
      padding: 20, color: '#F2EBDF',
      boxShadow: '0 20px 34px -20px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,201,166,0.42) 0%, transparent 70%)', top: -36, right: -36, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 1.2px)', backgroundSize: '14px 14px' }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', width: 72, height: 72 }}>
          <div style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: 'linear-gradient(150deg, #4FC9A6, transparent 60%)', filter: 'blur(2px)' }} />
          <div style={{
            position: 'absolute', inset: 3, borderRadius: '50%',
            background: 'linear-gradient(150deg, #2A2522, #16120E)',
            border: '1px solid rgba(79,201,166,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600, fontSize: 28, color: '#F2EBDF',
            boxShadow: 'inset 0 0 20px rgba(79,201,166,0.12)',
          }}>{profile.displayName.charAt(0).toUpperCase()}</div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 999,
          background: 'rgba(79,201,166,0.1)', border: '1px solid rgba(79,201,166,0.38)',
          fontSize: 10, fontWeight: 600, color: '#4FC9A6', letterSpacing: '0.1em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 5,
          boxShadow: '0 0 12px rgba(79,201,166,0.22)',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#4FC9A6', boxShadow: '0 0 5px #4FC9A6' }} />
          Premium
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: '"Fraunces", Georgia, serif', fontSize: 26, fontWeight: 600, color: '#F2EBDF', letterSpacing: '-0.015em', lineHeight: 1 }}>{profile.displayName}</div>
        <div style={{ fontSize: 10, color: '#4FC9A6', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
          ◆ member · {profile.memberSince}
        </div>
      </div>
      {profile.bio && <div style={{ fontSize: 12, color: 'rgba(242,235,223,0.68)', lineHeight: 1.5, position: 'relative' }}>{profile.bio}</div>}
      <div style={{
        marginTop: 'auto', position: 'relative',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', color: '#F2EBDF',
      }}>
        <StatBlock label="Games" value={profile.gamesPlayed} color="#F2EBDF" />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
        <StatBlock label="Level" value={`Lv. ${profile.level}`} color="#4FC9A6" />
      </div>
    </div>
  )
}

interface PremiumProfileCardProps {
  style: PremiumCardStyle
  profile: ProfileData
}

export default function PremiumProfileCard({ style, profile }: PremiumProfileCardProps) {
  if (style === 'gold')  return <GoldCard  profile={profile} />
  if (style === 'glass') return <GlassCard profile={profile} />
  if (style === 'holo')  return <HoloCard  profile={profile} />
  if (style === 'dark')  return <DarkCard  profile={profile} />
  return <GoldCard profile={profile} />
}
