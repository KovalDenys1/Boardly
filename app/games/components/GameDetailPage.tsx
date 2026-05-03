import Link from 'next/link'
import Footer from '@/components/Footer'
import TicTacToeGameIcon from '@/components/ui/TicTacToeGameIcon'

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
  icon: string
  iconLabel: string
  iconVariant?: 'tic-tac-toe'
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
}

function GameDetailIcon({
  icon,
  iconLabel,
  iconVariant,
}: {
  icon: string
  iconLabel: string
  iconVariant?: GameDetailPageProps['iconVariant']
}) {
  if (iconVariant === 'tic-tac-toe') {
    return <TicTacToeGameIcon size={94} />
  }

  return (
    <span
      className="grid h-[94px] w-[94px] place-items-center rounded-[1.4rem] border-2 border-bd-ink bg-bd-sun text-5xl shadow-[4px_4px_0_var(--bd-ink)]"
      role="img"
      aria-label={iconLabel}
    >
      {icon}
    </span>
  )
}

export default function GameDetailPage({
  gameName,
  title,
  description,
  icon,
  iconLabel,
  iconVariant,
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
}: GameDetailPageProps) {
  return (
    <div className="bd-page bd-screen flex min-h-[calc(100dvh-64px)] flex-col overflow-y-auto text-bd-ink">
      <main className="mx-auto w-full max-w-6xl grow px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm font-semibold text-bd-ink-muted" aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bd-ink">Home</Link>
          <span>/</span>
          <Link href="/games" className="transition-colors hover:text-bd-ink">Games</Link>
          <span>/</span>
          <span className="text-bd-ink">{gameName}</span>
        </nav>

        <section className="bd-card relative mb-8 overflow-hidden p-6 sm:p-8">
          <div className="bd-dot-grid pointer-events-none absolute inset-0 opacity-30" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
            style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <span className="bd-kicker mb-3 block">Game guide</span>
              <h1 className="font-display text-[clamp(40px,6vw,70px)] font-black leading-[0.95] text-bd-ink">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-bd-ink-soft sm:text-lg">
                {description}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {primaryCtaDisabled ? (
                  <span className="bd-btn bd-btn-primary bd-btn-lg cursor-not-allowed justify-center opacity-70" aria-disabled="true">
                    {primaryCtaLabel}
                  </span>
                ) : (
                  <Link href={lobbiesHref} className="bd-btn bd-btn-primary bd-btn-lg justify-center">
                    {primaryCtaLabel}
                  </Link>
                )}
                <Link href="/games" className="bd-btn bd-btn-soft bd-btn-lg justify-center">
                  Browse games
                </Link>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <GameDetailIcon icon={icon} iconLabel={iconLabel} iconVariant={iconVariant} />
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
            <h2 className="font-display text-3xl font-black text-bd-ink">How to play</h2>
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
                <li key={item} className="rounded-2xl border border-bd-line bg-white px-4 py-3 text-sm font-semibold leading-relaxed text-bd-ink-soft">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="py-10 text-center">
          {primaryCtaDisabled ? (
            <span className="bd-btn bd-btn-coral bd-btn-lg cursor-not-allowed justify-center opacity-70" aria-disabled="true">
              {primaryCtaLabel}
            </span>
          ) : (
            <Link href={lobbiesHref} className="bd-btn bd-btn-coral bd-btn-lg justify-center">
              Start playing
            </Link>
          )}
          <p className="mt-4 text-sm font-medium text-bd-ink-muted">
            {primaryCtaDisabled ? 'This game is still being polished.' : 'You can play as a guest. No app download needed.'}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
