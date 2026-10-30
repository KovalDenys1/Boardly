import type { ComponentType, ReactNode } from 'react'
import type { GuideIcon, LocalizedGuideSeo } from '@/lib/guides-catalog'
import type { GuideLocale, PrefixedGuideLocale } from '@/lib/seo-locales'
import type { GuideFaqItem } from './GuideLayout'

/**
 * Every word of one guide page in one language. A link inside a string is written
 * `[label](/path)` with the English path; the page puts it in the reader's language.
 */
export interface GuideCopy<Body> {
  title: string
  subtitle: string
  question: string
  answer: string
  cta: { label: string; detail: string }
  related: { href: string; label: string }[]
  body: Body
  faqTitle: string
  faq: GuideFaqItem[]
}

/** A translation also carries the copy in its `<head>`, which the English guide keeps in the catalog. */
export interface LocalizedGuideCopy<Body> extends GuideCopy<Body> {
  seo: LocalizedGuideSeo
}

export interface GuideBodyProps<Body> {
  body: Body
  locale: GuideLocale
}

/** The English copy, which the catalog dresses with its `<head>`, and one translation per prefixed language. */
export type GuideCopies<Body> = { en: GuideCopy<Body> } & Record<PrefixedGuideLocale, LocalizedGuideCopy<Body>>

interface GuideDefinition<Body> {
  slug: string
  icon: GuideIcon
  accentColor: string
  ctaHref: string
  Body: ComponentType<GuideBodyProps<Body>>
  copy: GuideCopies<Body>
}

/** One guide, its body already bound to its copy, so a registry can hold guides of different shapes. */
export interface RegisteredGuide {
  slug: string
  icon: GuideIcon
  accentColor: string
  ctaHref: string
  copy: GuideCopies<unknown>
  renderBody: (locale: GuideLocale) => ReactNode
}

export function defineGuide<Body>({ Body, ...guide }: GuideDefinition<Body>): RegisteredGuide {
  return {
    ...guide,
    renderBody: (locale) => <Body body={guide.copy[locale].body} locale={locale} />,
  }
}
