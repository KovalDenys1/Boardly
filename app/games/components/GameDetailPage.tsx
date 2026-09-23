'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Footer from '@/components/Footer'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { getGameSeo } from '@/lib/game-catalog'
import { getGuidesForGame } from '@/lib/guides-catalog'
import PlayVsBotButton from './PlayVsBotButton'
import GameScreenshot, { hasScreenshot } from './GameScreenshot'

type DetailStep = {
  title: string
  desc: string
}

type DetailFact = {
  label: string
  value: string
}

/** One row of a scoring group: the category, what it pays, and the rule behind it. */
type DetailScoringRow = {
  name: string
  value: string
  rule: string
}

/** A block of the scorecard – rendered as stacked cards, never a <table>, so it reads at 320 px. */
type DetailScoringGroup = {
  title: string
  note?: string
  rows: DetailScoringRow[]
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
  /*
   * The long-form sections (SEO Track A, #1077). Every one is optional and
   * renders only when present, so a game page that has not been expanded yet
   * looks exactly as it did. All copy arrives already translated, the same
   * convention `steps` and `benefits` use, and each section carries an id a
   * guide can deep-link to (`/games/yahtzee#strategy`).
   */
  /** Turn structure, what is compulsory, what ends the game. */
  rules?: string[]
  /** The scorecard, grouped. */
  scoring?: DetailScoringGroup[]
  /** What the create form actually offers: modes, timers, bots. */
  modes?: DetailStep[]
  strategy?: DetailStep[]
  mistakes?: DetailStep[]
  /** Four fixed topics: with friends, bots and solo, the turn timer, guest and no download. */
  multiplayer?: DetailStep[]
  audience?: string[]
  /** Paragraphs. Absorbs `originNote` on a page that has one. */
  history?: string[]
  /** Prominent callout for games that need a real group (no bots), e.g. Alias (#780) */
  groupNotice?: string
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
  primaryCtaLabel,
  primaryCtaDisabled = false,
  facts,
  introTitle,
  intro,
  steps,
  benefitsTitle,
  benefits,
  originNote,
  rules,
  scoring,
  modes,
  strategy,
  mistakes,
  multiplayer,
  audience,
  history,
  groupNotice,
  playVsBotGameType,
}: GameDetailPageProps) {
  const { t } = useTranslation()
  const { status } = useSession()
  const { isGuest } = useGuest()
  // Every guide the catalog files under this game – a page used to name one
  // guide by hand and the strategy guides were linked from no game page.
  const guides = getGuidesForGame(gameId)
  // Resolved here rather than defaulted in the signature: a default parameter
  // value is not JSX, so `primaryCtaLabel = 'Play now'` shipped an English
  // button to every non-English viewer of the pages that omit the prop - the
  // same fault as PasswordInput's `label = 'Password'` (#889).
  const ctaLabel = primaryCtaLabel ?? t('games.playNow')
  // The "you can play as a guest" pitch only makes sense for anonymous visitors.
  const showGuestHint = status === 'unauthenticated' && !isGuest
  // The question this page answers, and its answer, live on the catalog entry
  // beside the title and description that put the visitor here (#929).
  const seo = getGameSeo(gameId)
  // The product questions under the direct answer. One catalog array feeds
  // this section and the FAQPage JSON-LD, so the schema can never carry an
  // answer the visitor cannot read (#923).
  const faq = seo?.faq ?? []
  return (
    <div className="bd-page bd-screen flex min-h-[var(--game-h)] flex-col overflow-y-auto text-bd-ink">
      <main className="mx-auto w-full max-w-6xl grow px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm font-semibold text-bd-ink-muted" aria-label={t('breadcrumbs.label')}>
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
                    {ctaLabel}
                  </span>
                ) : (
                  <Link href={lobbiesHref} className="bd-btn bd-btn-primary bd-btn-lg justify-center sm:w-[190px]">
                    {ctaLabel}
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

            {hasScreenshot(gameId) ? (
              <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:w-[26rem]">
                <GameScreenshot gameId={gameId} gameName={gameName} />
                <div className="absolute -left-4 -top-4">
                  <GameIcon gameId={gameId} accentColor={accentColor ?? 'var(--bd-coral)'} size={72} label={iconLabel} />
                </div>
              </div>
            ) : (
              <div className="flex justify-center lg:justify-end">
                <GameIcon gameId={gameId} accentColor={accentColor ?? 'var(--bd-coral)'} size={94} label={iconLabel} />
              </div>
            )}
          </div>
        </section>

        {/* The direct answer, above the facts and every section: a visitor who
            arrived on "can you play X online free" reads the answer first. */}
        {seo && (
          <section className="bd-card mb-8 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-black text-bd-ink sm:text-3xl">
              {t(seo.questionKey)}
            </h2>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-bd-ink-soft sm:text-base">
              {t(seo.answerKey)}
            </p>
          </section>
        )}

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


        {rules && rules.length > 0 && (
          <section id="rules" className="bd-card mt-8 scroll-mt-24 p-6 sm:p-8">
            <SectionHeading>{t('games.detail.sections.rules', { gameName })}</SectionHeading>
            <ol className="mt-5 grid gap-3 lg:grid-cols-2">
              {rules.map((rule, index) => (
                <li key={rule} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-2xl border border-bd-line bg-bd-card-warm px-4 py-3">
                  <span className="font-display text-lg font-black text-bd-ink-muted">{index + 1}</span>
                  <span className="text-sm font-medium leading-relaxed text-bd-ink-soft">{rule}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {scoring && scoring.length > 0 && (
          <section id="scoring" className="bd-card mt-8 scroll-mt-24 p-6 sm:p-8">
            <SectionHeading>{t('games.detail.sections.scoring', { gameName })}</SectionHeading>
            <div className="mt-5 space-y-6">
              {scoring.map((group) => (
                <div key={group.title}>
                  <h3 className="font-display text-xl font-black text-bd-ink">{group.title}</h3>
                  {group.note && (
                    <p className="mt-1 text-sm font-medium leading-relaxed text-bd-ink-muted">{group.note}</p>
                  )}
                  {/* Stacked cards, not a <table>: fifteen rows of three
                      columns cannot be read at 320 px, one card per row can. */}
                  <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                    {group.rows.map((row) => (
                      <li key={row.name} className="rounded-2xl border border-bd-line bg-bd-card-warm px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <strong className="text-sm font-black text-bd-ink">{row.name}</strong>
                          <span className="text-xs font-bold text-bd-ink-muted">{row.value}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium leading-relaxed text-bd-ink-soft">{row.rule}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {modes && modes.length > 0 && (
          <DetailCardSection id="modes" heading={t('games.detail.sections.modes', { gameName })} items={modes} />
        )}

        {strategy && strategy.length > 0 && (
          <DetailCardSection id="strategy" heading={t('games.detail.sections.strategy', { gameName })} items={strategy} numbered />
        )}

        {mistakes && mistakes.length > 0 && (
          <DetailCardSection id="mistakes" heading={t('games.detail.sections.mistakes', { gameName })} items={mistakes} />
        )}

        {multiplayer && multiplayer.length > 0 && (
          <DetailCardSection id="multiplayer" heading={t('games.detail.sections.multiplayer', { gameName })} items={multiplayer} />
        )}

        <section className="mt-8 rounded-[1.75rem] border border-bd-line bg-bd-card-warm p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.7fr_minmax(0,1fr)] lg:items-start">
            <div>
              {/* i18n-allow: brand name, identical in all four locales */}
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

        {audience && audience.length > 0 && (
          <DetailProseSection id="audience" heading={t('games.detail.sections.audience', { gameName })} paragraphs={audience} />
        )}

        {history && history.length > 0 && (
          <DetailProseSection id="history" heading={t('games.detail.sections.history', { gameName })} paragraphs={history} />
        )}

        {faq.length > 0 && (
          <section id="faq" className="bd-card mt-8 scroll-mt-24 p-6 sm:p-8">
            <SectionHeading>{t('games.detail.sections.faq', { gameName })}</SectionHeading>
            <dl className="mt-5 divide-y divide-bd-line">
              {faq.map(({ questionKey, answerKey }) => (
                <div key={questionKey} className="py-4 first:pt-0 last:pb-0">
                  <dt className="text-base font-black text-bd-ink">{t(questionKey)}</dt>
                  <dd className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-bd-ink-soft sm:text-base">{t(answerKey)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {guides.length > 0 && (
          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-bd-line bg-bd-bg2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-bd-ink-soft">
              {t('games.guideCallout', { gameName })}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              {guides.map((guide) => (
                <Link key={guide.slug} href={`/guides/${guide.slug}`} className="bd-btn bd-btn-soft text-sm">
                  {t('games.readGuide')}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="py-10 text-center">
          {primaryCtaDisabled ? (
            <span className="bd-btn bd-btn-coral bd-btn-lg cursor-not-allowed justify-center opacity-70" aria-disabled="true">
              {ctaLabel}
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

function SectionHeading({ children }: { children: string }) {
  return <h2 className="font-display text-3xl font-black text-bd-ink">{children}</h2>
}

/** A titled section of title + description cards, two to a row from `sm` up. */
function DetailCardSection({
  id,
  heading,
  items,
  numbered = false,
}: {
  id: string
  heading: string
  items: DetailStep[]
  numbered?: boolean
}) {
  return (
    <section id={id} className="bd-card mt-8 scroll-mt-24 p-6 sm:p-8">
      <SectionHeading>{heading}</SectionHeading>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map(({ title, desc }, index) => (
          <li key={title} className="rounded-2xl border border-bd-line bg-bd-card-warm px-4 py-4">
            <strong className="block text-sm font-black text-bd-ink sm:text-base">
              {numbered && <span className="mr-2 text-bd-ink-muted">{index + 1}.</span>}
              {title}
            </strong>
            <p className="mt-1 text-sm font-medium leading-relaxed text-bd-ink-soft">{desc}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DetailProseSection({ id, heading, paragraphs }: { id: string; heading: string; paragraphs: string[] }) {
  return (
    <section id={id} className="bd-card mt-8 scroll-mt-24 p-6 sm:p-8">
      <SectionHeading>{heading}</SectionHeading>
      <div className="mt-4 max-w-3xl space-y-4 text-sm font-medium leading-relaxed text-bd-ink-soft sm:text-base">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}
