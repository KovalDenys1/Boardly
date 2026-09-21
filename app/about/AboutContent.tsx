'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import { useTranslation } from '@/lib/i18n-helpers'
import { GITHUB_REPO_URL, SUPPORT_EMAIL } from './about-json-ld'

const linkStyle = { color: 'var(--bd-coral-deep)', textDecoration: 'underline', textUnderlineOffset: 3 } as const

export default function AboutContent() {
  const { t } = useTranslation()

  return (
    <div className="bd-page flex min-h-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label={t('breadcrumbs.label')}>
          <Link href="/" className="transition-colors hover:text-bd-ink">{t('breadcrumbs.home')}</Link>
          <span>/</span>
          <span style={{ color: 'var(--bd-ink)' }}>{t('about.breadcrumb')}</span>
        </nav>

        <article className="bd-card p-8 md:p-12">
          <h1
            className="mb-6 text-3xl font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            {t('about.title')}
          </h1>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            <p className="text-base" style={{ color: 'var(--bd-ink)' }} data-testid="about-entity">
              {t('about.entity')}
            </p>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('about.originTitle')}</h2>
              <p className="mb-3">{t('about.origin1')}</p>
              <p>{t('about.origin2')}</p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('about.notTitle')}</h2>
              <p>{t('about.not')}</p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('about.fundingTitle')}</h2>
              <p>{t('about.funding')}</p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('about.contactTitle')}</h2>
              <p className="mb-3">{t('about.contactIntro')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>
                </li>
                <li>
                  <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    {t('about.githubRepo')}
                  </a>
                </li>
              </ul>
            </section>

            <p className="pt-4" style={{ borderTop: '1px solid var(--bd-line)' }}>
              <Link href="/games" style={linkStyle}>{t('about.playCta')}</Link>
            </p>
          </div>
        </article>
      </div>
      <Footer />
    </div>
  )
}
