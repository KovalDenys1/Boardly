'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { needsAccountStep, useOnboarding } from '@/contexts/OnboardingContext'
import { useTour } from '@/contexts/TourContext'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { getPublicRegisteredGameTypes, getGameLobbiesRoute } from '@/lib/public-game-access'
import { getGameMetadata, hasBotSupport } from '@/lib/game-catalog'
import GameIcon from '@/components/GameIcon'

/**
 * `account` comes first, and only for a signed-in account with something to settle: the
 * 13-or-older confirmation an OAuth account gives here instead of on the register form
 * (#1135), and the offer to make a friends-only profile public (#1131). Then the usual
 * game choice.
 */
type OnboardingStep = 'account' | 'choice' | 'quick-start'

export function OnboardingModal() {
  const router = useRouter()
  const { t } = useTranslation()
  const { showModal, accountSetup, saveAccountSetup, completeOnboarding, skipOnboarding, hideModal } = useOnboarding()
  const { isActive: isTourActive, startTour } = useTour()
  const [step, setStep] = useState<OnboardingStep>('choice')
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  // Unticked on purpose: a public profile is an opt-in (#1131, GDPR Art. 25(2)).
  const [profilePublic, setProfilePublic] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  // The age confirmation cannot be skipped: no close button and no "Skip for now" on
  // this step while it is asked. Someone under 13 signs out instead.
  const ageRequired = step === 'account' && accountSetup.confirmAge
  const accountContinueBlocked = savingAccount || (accountSetup.confirmAge && !ageConfirmed)

  const games = useMemo(
    () => getPublicRegisteredGameTypes().map((type) => ({ type, meta: getGameMetadata(type)! })),
    []
  )

  useEffect(() => {
    if (!showModal) {
      setStep('choice')
      setSelectedGame(null)
      return
    }
    if (needsAccountStep(accountSetup)) setStep('account')
  }, [showModal, accountSetup])

  useEffect(() => {
    if (!showModal || isTourActive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [showModal, isTourActive])

  if (!showModal || isTourActive) return null

  const handleShowMeAround = () => {
    hideModal()
    startTour()
  }

  const handleSignOut = async () => {
    hideModal()
    await signOut({ redirect: false })
    router.replace('/')
  }

  const handleAccountContinue = async () => {
    if (accountContinueBlocked) return
    setSavingAccount(true)
    try {
      await saveAccountSetup({ ageConfirmed: accountSetup.confirmAge && ageConfirmed, profilePublic })
      setStep('choice')
    } catch {
      showToast.error('common.error')
    } finally {
      setSavingAccount(false)
    }
  }

  const handleStart = async () => {
    if (!selectedGame || loading) return
    setLoading(true)
    try {
      if (hasBotSupport(selectedGame)) {
        const lobbyRes = await fetchWithGuest('/api/lobby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameType: selectedGame, maxPlayers: 2 }),
        })
        if (!lobbyRes.ok) throw new Error('Failed to create lobby')
        const { lobby } = (await lobbyRes.json()) as { lobby: { code: string } }

        const botRes = await fetchWithGuest(`/api/lobby/${lobby.code}/add-bot`, { method: 'POST' })
        if (!botRes.ok) throw new Error('Failed to add bot')

        await completeOnboarding()
        router.push(`/lobby/${lobby.code}`)
      } else {
        const route = getGameLobbiesRoute(selectedGame)
        await completeOnboarding()
        router.push(route ?? '/games')
      }
    } catch {
      showToast.error('common.error')
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: 'rgba(31,27,22,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bd-card-warm)',
          border: '2px solid var(--bd-ink)',
          padding: '24px 24px 32px',
          maxHeight: '92dvh',
          overflowY: 'auto',
        }}
        className="rounded-[20px_20px_0_0] shadow-[0_-4px_0_var(--bd-ink)] sm:rounded-[20px] sm:shadow-[6px_6px_0_var(--bd-ink)]"
      >
        {/* Drag handle — mobile only */}
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: 'var(--bd-ink)',
            opacity: 0.2,
            margin: '0 auto 20px',
          }}
          className="sm:hidden"
        />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20, position: 'relative' }}>
          {/* X close button, gone while the age confirmation is asked */}
          {!ageRequired && (
            <button
              onClick={skipOnboarding}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--bd-bg2)',
                border: '2px solid var(--bd-ink)',
                borderRadius: 8,
                boxShadow: '2px 2px 0 var(--bd-ink)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--bd-ink)',
                lineHeight: 1,
              }}
              aria-label={t('common.close')}
            >
              <Icon name="close" size={16} />
            </button>
          )}

          <div
            style={{
              width: 56,
              height: 56,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--bd-sun)',
              border: '2px solid var(--bd-ink)',
              borderRadius: 14,
              boxShadow: '3px 3px 0 var(--bd-ink)',
              margin: '0 auto 14px',
            }}
          >
            <GameIcon gameId="yahtzee" accentColor="var(--bd-ink)" size={28} />
          </div>
          <h2
            style={{
              fontFamily: 'var(--bd-font-display)',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--bd-ink)',
              marginBottom: 4,
            }}
          >
            {t('onboarding.title')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--bd-ink-muted)' }}>
            {step === 'account' ? t('onboarding.account.subtitle') : t('onboarding.subtitle')}
          </p>
        </div>

        {step === 'account' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {accountSetup.confirmAge && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    background: 'var(--bd-bg)',
                    border: '2px solid var(--bd-ink)',
                    borderRadius: 14,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(event) => setAgeConfirmed(event.target.checked)}
                    disabled={savingAccount}
                    required
                    style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--bd-coral)', cursor: 'pointer' }}
                  />
                  <span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--bd-ink)' }}>
                      {t('onboarding.account.ageConfirm')}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 12, lineHeight: 1.45, color: 'var(--bd-ink-soft)' }}>
                      {t('onboarding.account.ageHint')}
                    </span>
                  </span>
                </label>
              )}
              {accountSetup.offerPublicProfile && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    background: 'var(--bd-bg)',
                    border: '2px solid var(--bd-ink)',
                    borderRadius: 14,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={profilePublic}
                    onChange={(event) => setProfilePublic(event.target.checked)}
                    disabled={savingAccount}
                    style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--bd-coral)', cursor: 'pointer' }}
                  />
                  <span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--bd-ink)' }}>
                      {t('onboarding.account.publicProfile')}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 12, lineHeight: 1.45, color: 'var(--bd-ink-soft)' }}>
                      {t('onboarding.account.publicProfileHint')}
                    </span>
                  </span>
                </label>
              )}
            </div>

            <button
              onClick={() => void handleAccountContinue()}
              disabled={accountContinueBlocked}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'var(--bd-coral)',
                color: 'white',
                border: '2px solid var(--bd-ink)',
                borderRadius: 14,
                boxShadow: '3px 3px 0 var(--bd-ink)',
                fontFamily: 'var(--bd-font-display)',
                fontSize: 15,
                fontWeight: 700,
                cursor: accountContinueBlocked ? 'not-allowed' : 'pointer',
                opacity: accountContinueBlocked ? 0.45 : 1,
                marginBottom: 12,
              }}
            >
              {savingAccount ? t('onboarding.account.saving') : t('onboarding.account.continue')}
            </button>

            <button
              onClick={ageRequired ? () => void handleSignOut() : skipOnboarding}
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--bd-ink-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              {ageRequired ? t('onboarding.account.signOut') : t('onboarding.skip')}
            </button>
          </>
        ) : step === 'choice' ? (
          <>
            {/* Path choice */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => setStep('quick-start')}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: 'var(--bd-coral)',
                  color: 'white',
                  border: '2px solid var(--bd-ink)',
                  borderRadius: 14,
                  boxShadow: '3px 3px 0 var(--bd-ink)',
                  fontFamily: 'var(--bd-font-display)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('onboarding.quickStart')}
              </button>
              <button
                onClick={handleShowMeAround}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  background: 'var(--bd-bg)',
                  color: 'var(--bd-ink)',
                  border: '2px solid var(--bd-ink)',
                  borderRadius: 14,
                  boxShadow: '3px 3px 0 var(--bd-ink)',
                  fontFamily: 'var(--bd-font-display)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('onboarding.showMeAround')}
              </button>
            </div>

            <button
              onClick={skipOnboarding}
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--bd-ink-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              {t('onboarding.skip')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep('choice')}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--bd-ink-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 0 12px',
              }}
            >
              {t('onboarding.back')}
            </button>

            {/* Game grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {games.map(({ type, meta }) => (
                <button
                  key={type}
                  onClick={() => setSelectedGame(type)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '16px 12px',
                    background: selectedGame === type ? 'var(--bd-sun)' : 'var(--bd-bg)',
                    border: `2px solid var(--bd-ink)`,
                    borderRadius: 14,
                    boxShadow: '3px 3px 0 var(--bd-ink)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transform: selectedGame === type ? 'translate(-1px, -1px)' : 'translate(0,0)',
                    transition: 'transform 0.1s, background 0.1s',
                  }}
                >
                  <GameIcon gameId={meta.svgId} accentColor={selectedGame === type ? 'var(--bd-ink)' : meta.accentColor} size={30} />
                  <span
                    style={{
                      fontFamily: 'var(--bd-font-display)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--bd-ink)',
                      lineHeight: 1.2,
                    }}
                  >
                    {meta.name}
                  </span>
                </button>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={handleStart}
              disabled={!selectedGame || loading}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'var(--bd-coral)',
                color: 'white',
                border: '2px solid var(--bd-ink)',
                borderRadius: 14,
                boxShadow: '3px 3px 0 var(--bd-ink)',
                fontFamily: 'var(--bd-font-display)',
                fontSize: 15,
                fontWeight: 700,
                cursor: !selectedGame || loading ? 'not-allowed' : 'pointer',
                opacity: !selectedGame || loading ? 0.45 : 1,
                marginBottom: 12,
              }}
            >
              {loading ? t('onboarding.starting') : t('onboarding.startPlaying')}
            </button>

            <button
              onClick={skipOnboarding}
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--bd-ink-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              {t('onboarding.skip')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
