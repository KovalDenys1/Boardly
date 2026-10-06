import type { EmailLanguage } from './email-layout'

const NORWEGIAN = new Set(['nb', 'nn', 'no'])

/**
 * The language a mail sent while answering this request is written in. Boardly keeps the
 * site language only in the browser, so the request's Accept-Language is the one signal the
 * server has: Norwegian when the reader ranks a Norwegian tag above English, English for any
 * other language, and undefined (English then Norwegian) when the request names none.
 */
export function emailLanguageFromRequest(request: { headers: Headers }): EmailLanguage | undefined {
  const header = request.headers.get('accept-language')
  if (!header) return undefined

  const ranked = header
    .split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(';')
      const q = params.map((param) => param.trim().toLowerCase()).find((param) => param.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { primary: tag.trim().toLowerCase().split('-')[0], weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((entry) => entry.primary && entry.primary !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  if (ranked.length === 0) return undefined
  return NORWEGIAN.has(ranked[0].primary) ? 'nb' : 'en'
}
