'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Footer from '@/components/Footer'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import PlayVsBotButton from './PlayVsBotButton'

type DetailStep = {
  title: string
  desc: string
}

type DetailFact = {
  label: string
  value: string
}

type GameDetailPageProps = {
  gameName: string
  title: string
  description: string
  /** Accessible name for the hero glyph. */
  iconLabel: string
  /** Catalog id from `lib/game-catalog.ts` – the hero glyph always comes from here. */
  gameId: string
  /** @deprecated #884 – ignored. Still declared only because TicTacToeDetailContent
   *  passes them; drop the props and that call site together. */
  accentColor?: string
  accent: string
  lobbiesHref: string
  primaryCtaLabel?: string
  primaryCtaDisabled?: boolean
  facts: DetailFact[]
  introTitle: string
  intro: string[]
  steps: DetailStep[]
  benefitsTitle: string
  benefits: string[]
  originNote?: string
  /** Prominent callout for games that need a real group (no bots), e.g. Alias (#780) */
  groupNotice?: string
  guideHref?: string
  playVsBotGameType?: string
}

export default function GameDetailPage({
  gameName,
  title,
  description,
  iconLabel,
  gameId,
  accentColor,
  accent,
  lobbiesHref,
  primaryCtaLabel = 'Play now',
  primaryCtaDisabled = false,
  facts,
  introTitle,
  intro,
  steps,
  benefitsTitle,
  benefits,
  originNote,
  groupNotice,
  guideHref,
  playVsBotGameType,
}: GameDetailPageProps) {
  const { t } = useTranslation()
  const { status } = useSession()
  const { isGuest } = useGuest()
  // The "you can play as a guest" pitch only makes sense for anonymous visitors.
  const showGuestHint = status === 'unauthenticated' && !isGuest
  return (
    <div className="bd-page bd-screen flex min-h-[var(--game-h)] flex-col overflow-y-auto text-bd-ink">
      <main className="mx-auto w-full max-w-6xl grow px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm font-semibold text-bd-ink-muted" aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bd-ink">{t('breadcrumbs.home')}</Link>
          <span>/</span>
          <Link href="/games" className="transition-colors hover:text-bd-ink">{t('breadcrumbs.games')}</Link>
          <span>/</span>
          <span className="text-bd-ink">{gameName}</span>
        </nav>

        {/* No overflow-hidden here — the Play vs Bot dropdown must escape the
            card; decorative layers clip themselves via rounded-[inherit]. */}
        <section className="bd-card relative mb-8 p-6 sm:p-8">
          <div className="bd-dot-grid pointer-events-none absolute inset-0 rounded-[inherit] opacity-30" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-[inherit]"
            style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="text-center lg:text-left">
              <span className="bd-kicker mb-3 block">{t('games.gameGuide')}</span>
              <h1 className="font-display text-[clamp(40px,6vw,70px)] font-black leading-[0.95] text-bd-ink">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-bd-ink-soft sm:text-lg">
                {description}
              </p>
              <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:items-start lg:justify-start">
                {primaryCtaDisabled ? (
                  <span className="bd-btn bd-btn-primary bd-btn-lg cursor-not-allowed justify-center opacity-70 sm:w-[190px]" aria-disabled="true">
                    {primaryCtaLabel}
                  </span>
                ) : (
                  <Link href={lobbiesHref} className="bd-btn bd-btn-primary bd-btn-lg justify-center sm:w-[190px]">
                    {primaryCtaLabel}
                  </Link>
                )}
                {playVsBotGameType && !primaryCtaDisabled && (
                  <PlayVsBotButton gameType={playVsBotGameType} className="sm:w-[190px]" />
                )}
                <Link href="/games" className="bd-btn bd-btn-ghost bd-btn-lg justify-center sm:w-[190px]">
                  {t('home.browseGames')}
                </Link>
              </div>
              {groupNotice && (
                <p className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900 dark:border-amber-600/60 dark:bg-amber-900/20 dark:text-amber-200">
                  <Icon name="users" size={16} weight="bold" /> {groupNotice}
                </p>
              )}
            </div>

            <div className="flex justify-center lg:justify-end">
              <GameIcon gameId={gameId} accentColor={accentColor ?? 'var(--bd-coral)'} size={94} label={iconLabel} />
            </div>
          </div>
        </section>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(({ label, value }) => (
            <div key={label} className="rounded-[1.4rem] border border-bd-line bg-bd-card-warm p-5">
              <div className="font-display text-2xl font-black text-bd-ink">{value}</div>
              <div className="mt-1 text-sm font-semibold text-bd-ink-muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_0.9fr]">
          <section className="bd-card p-6 sm:p-8">
            <h2 className="font-display text-3xl font-black text-bd-ink">{introTitle}</h2>
            <div className="mt-4 space-y-4 text-sm font-medium leading-relaxed text-bd-ink-soft sm:text-base">
              {intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="bd-card p-6 sm:p-8">
            <h2 className="font-display text-3xl font-black text-bd-ink">{t('games.howToPlay')}</h2>
            <ol className="mt-5 space-y-4">
              {steps.map(({ title: stepTitle, desc }, index) => (
                <li key={stepTitle} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-bd-ink bg-bd-sun font-display text-sm font-black shadow-[2px_2px_0_var(--bd-ink)]">
                    {index + 1}
                  </span>
                  <span>
                    <strong className="block text-sm font-black text-bd-ink sm:text-base">{stepTitle}</strong>
                    <span className="mt-1 block text-sm font-medium leading-relaxed text-bd-ink-muted">{desc}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="mt-8 rounded-[1.75rem] border border-bd-line bg-bd-card-warm p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.7fr_minmax(0,1fr)] lg:items-start">
            <div>
              <span className="bd-kicker mb-2 block">Boardly</span>
              <h2 className="font-display text-3xl font-black text-bd-ink">{benefitsTitle}</h2>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {benefits.map((item) => (
                <li key={item} className="rounded-2xl border border-bd-line bg-bd-card-warm px-4 py-3 text-sm font-semibold leading-relaxed text-bd-ink-soft">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {originNote && (
            <p className="mt-6 border-t border-bd-line pt-5 text-sm italic leading-relaxed text-bd-ink-muted">
              {originNote}
            </p>
          )}
        </section>

        {guideHref && (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-bd-line bg-bd-bg2 px-6 py-4">
            <p className="text-sm font-semibold text-bd-ink-soft">
              {t('games.guideCallout', { gameName })}
            </p>
            <Link href={guideHref} className="bd-btn bd-btn-soft shrink-0 text-sm">
              {t('games.readGuide')}
            </Link>
          </div>
        )}

        <div className="py-10 text-center">
          {primaryCtaDisabled ? (
            <span className="bd-btn bd-btn-coral bd-btn-lg cursor-not-allowed justify-center opacity-70" aria-disabled="true">
              {primaryCtaLabel}
            </span>
          ) : (
            <Link href={lobbiesHref} className="bd-btn bd-btn-coral bd-btn-lg justify-center">
              {t('games.startPlaying')}
            </Link>
          )}
          {(primaryCtaDisabled || showGuestHint) && (
            <p className="mt-4 text-sm font-medium text-bd-ink-muted">
              {primaryCtaDisabled ? t('games.stillBeingPolished') : t('games.noDownloadNeeded')}
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
