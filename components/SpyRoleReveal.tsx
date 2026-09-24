'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { onOwnAnimationEnd } from '@/lib/social-motion'

interface RoleRevealProps {
  role: string
  location?: string
  locationRole?: string
  possibleCategories?: string[]
  onReady: () => void
  playersReady: number
  totalPlayers: number
  isReady: boolean
  /**
   * Play the card flip (#1115): true only while this round's reveal is fresh
   * (SpyGameBoard's useFreshKey), so a reload or a tab switch shows the role
   * face up at once.
   */
  flip?: boolean
  onFlipEnd?: () => void
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
  flip = false,
  onFlipEnd,
}: RoleRevealProps) {
  const { t } = useTranslation()

  const isSpy = role === 'Spy'

  return (
    <div className="spy-stage">
      {/* Three named regions, not six loose children: in phone landscape the
          card becomes a two-column grid (identity and action left, the secret
          right) and CSS needs something to place (#901). Stacked with the same
          gap everywhere else, so nothing moves at the other viewports. */}
      <div className="spy-role-flip">
        <div
          className={`spy-role-flip__inner ${flip ? 'spy-role-flip__inner--play' : ''}`}
          onAnimationEnd={onFlipEnd ? onOwnAnimationEnd(onFlipEnd) : undefined}
          data-testid="spy-role-flip"
        >
          <div className="spy-role-card">
            <div className="spy-role-identity">
              <div className={`spy-role-mark ${isSpy ? 'spy-role-mark-alert' : 'spy-role-mark-safe'}`}>
                <span>{isSpy ? 'S' : 'R'}</span>
              </div>

              <div className="text-center">
                <p className="bd-kicker">{t('spy.yourRole')}</p>
                <h2 className={`spy-role-title ${isSpy ? 'text-[var(--bd-coral-deep)]' : 'text-[var(--bd-mint-deep)]'}`}>
                  {t(isSpy ? 'spy.roles.spy' : 'spy.roles.regular')}
                </h2>
              </div>
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

            <div className="spy-role-action">
              <button
                onClick={onReady}
                disabled={isReady}
                className={`bd-btn w-full justify-center ${isReady ? 'bd-btn-soft cursor-not-allowed opacity-70' : 'bd-btn-primary'}`}
              >
                {isReady ? t('spy.readyConfirmed') : t('spy.ready')}
              </button>

              <div className="spy-ready-meter">
                <div
                  className="social-meter-fill bg-[var(--bd-mint)]"
                  style={{ transform: `scaleX(${totalPlayers > 0 ? playersReady / totalPlayers : 0})` }}
                />
              </div>
              <p className="text-center text-sm font-semibold text-[var(--bd-ink-muted)]">
                {t('spy.playersReady', { count: playersReady, total: totalPlayers })}
              </p>
            </div>
          </div>
          {/* The card's back, seen only while it turns over. */}
          <div className="spy-role-flip__back" aria-hidden="true">
            <Icon name="eye" size={44} />
          </div>
        </div>
      </div>
    </div>
  )
}
