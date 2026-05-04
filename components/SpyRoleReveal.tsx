'use client'

import { useTranslation } from '@/lib/i18n-helpers'

interface RoleRevealProps {
  role: string
  location?: string
  locationRole?: string
  possibleCategories?: string[]
  onReady: () => void
  playersReady: number
  totalPlayers: number
  isReady: boolean
}

export default function SpyRoleReveal({
  role,
  location,
  locationRole,
  possibleCategories,
  onReady,
  playersReady,
  totalPlayers,
  isReady,
}: RoleRevealProps) {
  const { t } = useTranslation()

  const isSpy = role === 'Spy'

  return (
    <div className="spy-stage">
      <div className="spy-role-card">
        <div className={`spy-role-mark ${isSpy ? 'spy-role-mark-alert' : 'spy-role-mark-safe'}`}>
          <span>{isSpy ? 'S' : 'R'}</span>
        </div>

        <div className="text-center">
          <p className="bd-kicker">{t('spy.yourRole')}</p>
          <h2 className={`spy-role-title ${isSpy ? 'text-[var(--bd-coral-deep)]' : 'text-[var(--bd-mint-deep)]'}`}>
            {t(isSpy ? 'spy.roles.spy' : 'spy.roles.regular')}
          </h2>
        </div>

        <div className="spy-role-info">
          {isSpy ? (
            <div>
              <h3 className="spy-section-title">{t('spy.possibleCategories')}</h3>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {possibleCategories?.map((category) => (
                  <span key={category} className="bd-chip bd-chip-coral">
                    {category}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm font-medium text-[var(--bd-ink-muted)]">
                {t('spy.rules.spyBlends')}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="spy-secret-tile">
                <p className="bd-kicker">{t('spy.location')}</p>
                <p className="mt-1 text-2xl font-black text-[var(--bd-ink)]">{location}</p>
              </div>
              <div className="spy-secret-tile">
                <p className="bd-kicker">{t('spy.roleAtLocation')}</p>
                <p className="mt-1 text-xl font-black text-[var(--bd-mint-deep)]">{locationRole}</p>
              </div>
              <p className="sm:col-span-2 text-sm font-medium text-[var(--bd-ink-muted)]">
                {t('spy.rules.identifySpy')}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onReady}
          disabled={isReady}
          className={`bd-btn w-full justify-center ${isReady ? 'bd-btn-soft cursor-not-allowed opacity-70' : 'bd-btn-primary'}`}
        >
          {isReady ? t('spy.ready') : t('spy.ready')}
        </button>

        <div className="spy-ready-meter">
          <div
            className="h-full rounded-full bg-[var(--bd-mint)] transition-all"
            style={{ width: `${totalPlayers > 0 ? (playersReady / totalPlayers) * 100 : 0}%` }}
          />
        </div>
        <p className="text-center text-sm font-semibold text-[var(--bd-ink-muted)]">
          {t('spy.playersReady', { count: playersReady, total: totalPlayers })}
        </p>
      </div>
    </div>
  )
}
