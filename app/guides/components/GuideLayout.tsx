import Link from 'next/link'
import AdSlot from '@/components/AdSlot'
import Footer from '@/components/Footer'
import GameIcon from '@/components/GameIcon'
import { Icon } from '@/components/icons'
import type { IconName } from '@/components/icons/names'
import { getGuideBySlug, type GuideIcon } from '@/lib/guides-catalog'
import { GUIDES_AD_SLOT } from '@/lib/ad-slots'

interface RelatedGuide {
  href: string
  label: string
}

interface GuideLayoutProps {
  /** The guide's mark: a game glyph (catalog id) or a chrome icon – same shape the guides index uses. */
  icon: GuideIcon
  /** The guide's catalog slug – the "Last updated" date is read from it, never hand-typed (#923). */
  slug: string
  title: string
  subtitle: string
  /**
   * The question this page answers, drawn as the first <h2>, with `answer`
   * directly under it (#923). A searcher who lands here gets the answer before
   * any section, and the heading matches the query rather than describing the
   * page.
   */
  question: string
  /** One sentence. If it needs two, the question is really two questions. */
  answer: string
  breadcrumbLabel: string
  accentColor: string
  cta: {
    href: string
    label: string
    detail: string
  }
  related: RelatedGuide[]
  children: React.ReactNode
}

export function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-6 rounded-[1.5rem] border p-7"
      style={{ background: 'var(--bd-card-warm)', borderColor: 'var(--bd-line)' }}
    >
      <h2
        className="mb-5 text-xl font-bold"
        style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

export interface GuideTip {
  /** Drawn in front of the tip. Omit where the tip needs no mark. */
  icon?: IconName
  tip: string
  detail: string
}

export function GuideTipList({ items }: { items: GuideTip[] }) {
  return (
    <ul className="space-y-4">
      {items.map(({ icon, tip, detail }) => (
        <li
          key={tip}
          className="border-b pb-4 last:border-0 last:pb-0"
          style={{ borderColor: 'var(--bd-line)' }}
        >
          <strong className="mb-1 block text-sm" style={{ color: 'var(--bd-ink)' }}>
            {icon ? <Icon name={icon} size={16} weight="bold" className="mr-1.5" /> : null}
            {tip}
          </strong>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            {detail}
          </p>
        </li>
      ))}
    </ul>
  )
}

export interface GuideChecklistItem {
  text: string
  /** 'yes' a mint check, 'no' a coral cross. */
  mark?: 'yes' | 'no'
  /** A descriptive icon instead of a yes/no mark, for lists that state facts rather than advice. */
  icon?: IconName
}

/**
 * `verdict` says whether the marks make a call or just bullet the list. Most of
 * these lists are requirements ("What You Need") or steps ("How It Works"),
 * where a check is the bullet the tick used to be and announcing "Recommended"
 * over it is wrong. Only where a list actually weighs yes against no does the
 * mark carry meaning a screen reader has to hear.
 */
export function GuideChecklist({ items, verdict = false }: { items: GuideChecklistItem[]; verdict?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map(({ text, mark, icon }) => (
        <li
          key={text}
          className="flex items-start gap-2 text-sm leading-relaxed"
          style={{ color: 'var(--bd-ink-soft)' }}
        >
          {mark ? (
            <Icon
              name={mark === 'yes' ? 'check' : 'close'}
              size={16}
              tone={mark === 'yes' ? 'mint' : 'coral'}
              label={verdict ? (mark === 'yes' ? 'Recommended' : 'Avoid') : undefined}
              className="mt-[3px]"
            />
          ) : icon ? (
            <Icon name={icon} size={16} weight="bold" className="mt-[3px]" />
          ) : (
            // A list with no mark and no icon still needs a bullet, and a plain
            // dot is the honest one: it must not look like the check, or a
            // sequence reads as a recommendation. Drawn rather than an <Icon>
            // because the set has no dot and a bullet is not an icon.
            <span
              aria-hidden
              className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full"
              style={{ background: 'var(--bd-ink-muted)' }}
            />
          )}
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

export function GuideSteps({ steps }: { steps: { title: string; detail: string }[] }) {
  return (
    <ol className="space-y-5">
      {steps.map(({ title, detail }, i) => (
        <li key={title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-black shadow-[2px_2px_0_var(--bd-ink)]"
            style={{
              borderColor: 'var(--bd-ink)',
              background: 'var(--bd-sun)',
              color: 'var(--bd-ink)',
              fontFamily: 'var(--bd-font-display)',
            }}
          >
            {i + 1}
          </span>
          <span>
            <strong className="block text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>
              {title}
            </strong>
            <span className="mt-1 block text-sm leading-relaxed" style={{ color: 'var(--bd-ink-muted)' }}>
              {detail}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function GuideTable({
  rows,
}: {
  rows: { name: string; desc: string; example: string }[]
}) {
  return (
    <div className="space-y-3">
      {rows.map(({ name, desc, example }) => (
        <div
          key={name}
          className="flex justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
          style={{ borderColor: 'var(--bd-line)' }}
        >
          <div>
            <strong className="block text-sm" style={{ color: 'var(--bd-ink)' }}>
              {name}
            </strong>
            <p className="text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
              {desc}
            </p>
          </div>
          <span className="shrink-0 self-center text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
            {example}
          </span>
        </div>
      ))}
    </div>
  )
}

export interface GuideFaqItem {
  question: string
  answer: string
}

/**
 * The FAQPage node for a guide, built from the array `GuideFaqList` renders on
 * the same page. Google treats an answer that is nowhere on the page as hidden
 * structured data, so the guides do not get to write the two separately: the
 * page defines one `faq` array, passes it to `GuideFaqList`, and passes the
 * same array here (#964). `__tests__/app/guide-faq-schema.test.tsx` fails if a
 * guide ever splits them again.
 */
export function buildGuideFaqJsonLd(items: GuideFaqItem[]) {
  // An empty `mainEntity` is not valid FAQPage, and a one-question FAQPage is
  // the thin pattern Google's structured-data spam policy is aimed at. A guide
  // with fewer than two questions should render the FAQ and ship no schema, so
  // refuse here rather than emit the node: the guides prerender at build time,
  // which turns this into a failed build instead of a live markup penalty.
  if (items.length < 2) {
    throw new Error(
      `buildGuideFaqJsonLd needs at least two questions, got ${items.length}. ` +
        'Render the FAQ without a FAQPage node instead.',
    )
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }
}

/**
 * The questions people actually type, answered in full sentences. A guide that
 * carries FAQPage structured data must render the same text on the page –
 * Google treats schema whose content the visitor cannot see as a violation,
 * and `/guides/best-2-player-games-online` shipped that way until #923.
 */
export function GuideFaqList({ items }: { items: GuideFaqItem[] }) {
  return (
    <div className="space-y-5">
      {items.map(({ question, answer }) => (
        <div key={question} className="border-b pb-5 last:border-0 last:pb-0" style={{ borderColor: 'var(--bd-line)' }}>
          {/* The marker lets the schema test compare the two sets directly
              rather than grepping the page source for how they were wired. */}
          <h3 data-testid="guide-faq-question" className="mb-2 text-sm font-bold" style={{ color: 'var(--bd-ink)' }}>
            {question}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            {answer}
          </p>
        </div>
      ))}
    </div>
  )
}

const UPDATED_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export default function GuideLayout({
  icon,
  slug,
  title,
  subtitle,
  question,
  answer,
  breadcrumbLabel,
  accentColor,
  cta,
  related,
  children,
}: GuideLayoutProps) {
  const updated = getGuideBySlug(slug).updated

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bd-ink">Home</Link>
          <span>/</span>
          <Link href="/guides" className="transition-colors hover:text-bd-ink">Guides</Link>
          <span>/</span>
          <span style={{ color: 'var(--bd-ink)' }}>{breadcrumbLabel}</span>
        </nav>

        {/* Hero card */}
        <div
          className="bd-card relative mb-8 overflow-hidden p-7 sm:p-8"
          style={{ background: 'var(--bd-card-warm)' }}
        >
          <div className="bd-dot-grid pointer-events-none absolute inset-0 opacity-30" />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
            style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
          />
          <div className="relative">
            <span className="bd-kicker mb-3 block">Guides</span>
            <div className="mb-3">
              {'game' in icon ? (
                <GameIcon gameId={icon.game} accentColor={accentColor} size={48} variant="bare" />
              ) : (
                <Icon name={icon.glyph} size={48} style={{ color: accentColor }} />
              )}
            </div>
            <h1
              className="mb-3 text-[clamp(28px,4vw,44px)] font-extrabold leading-tight"
              style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
            >
              {title}
            </h1>
            <p className="text-sm" style={{ color: 'var(--bd-ink-muted)' }}>{subtitle}</p>
            <p className="mt-3 text-xs" style={{ color: 'var(--bd-ink-muted)' }}>
              Last updated <time dateTime={updated}>{UPDATED_FORMAT.format(new Date(`${updated}T00:00:00Z`))}</time>
            </p>
          </div>
        </div>

        {/* The direct answer, before any section */}
        <section
          className="mb-6 rounded-[1.5rem] border p-7"
          style={{ background: 'var(--bd-card-warm)', borderColor: 'var(--bd-line)' }}
        >
          <h2
            className="mb-3 text-xl font-bold"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {question}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            {answer}
          </p>
        </section>

        {/* Content sections */}
        {children}

        {/* CTA */}
        <div
          className="mb-8 rounded-[1.5rem] border p-8 text-center"
          style={{ background: 'var(--bd-card-warm)', borderColor: 'var(--bd-line)' }}
        >
          <p className="mb-5 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{cta.detail}</p>
          <Link href={cta.href} className="bd-btn bd-btn-coral bd-btn-lg inline-flex">
            {cta.label} →
          </Link>
        </div>

        {/* Related guides */}
        <div
          className="rounded-[1.5rem] border p-6"
          style={{ background: 'var(--bd-card-warm)', borderColor: 'var(--bd-line)' }}
        >
          <h3
            className="mb-4 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--bd-ink-muted)' }}
          >
            More guides
          </h3>
          <div className="flex flex-col gap-2">
            {related.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm transition-colors hover:text-bd-coral"
                style={{ color: 'var(--bd-ink-soft)' }}
              >
                → {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Last thing on the page, below every CTA, so an ad can never be
            mistaken for a Boardly action or clicked by accident. */}
        <AdSlot slot={GUIDES_AD_SLOT} className="mt-8" />

      </div>
      <Footer />
    </div>
  )
}
