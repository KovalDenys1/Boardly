import type { EmailLanguage } from './email-layout'

const NORWEGIAN = new Set(['nb', 'nn', 'no'])

function fromTag(tag: string | null | undefined): EmailLanguage {
  const primary = tag?.trim().toLowerCase().split('-')[0]
  return primary && NORWEGIAN.has(primary) ? 'nb' : 'en'
}

/**
 * The language a mail to an account is written in, from the site locale stored on it
 * (`Users.language`, #1331): Norwegian for `no`, English for every other locale and for none.
 * Mail copy exists in those two languages only.
 */
export function emailLanguageFromLocale(locale: string | null | undefined): EmailLanguage {
  return fromTag(locale)
}

/**
 * The language a mail sent while answering this request is written in, for someone with no
 * stored language: Norwegian when the reader ranks a Norwegian tag above English, English
 * otherwise and when the request names no language.
 */
export function emailLanguageFromRequest(request: { headers: Headers }): EmailLanguage {
  const header = request.headers.get('accept-language')
  if (!header) return 'en'

  const ranked = header
    .split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(';')
      const q = params.map((param) => param.trim().toLowerCase()).find((param) => param.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  return ranked.length === 0 ? 'en' : fromTag(ranked[0].tag)
}

/**
 * A request-time mail: the account's stored language when it has one, Accept-Language when it
 * does not (no account yet, or an account the browser has not written a language for).
 */
export function emailLanguageFor(
  stored: string | null | undefined,
  request: { headers: Headers }
): EmailLanguage {
  return stored ? emailLanguageFromLocale(stored) : emailLanguageFromRequest(request)
}
