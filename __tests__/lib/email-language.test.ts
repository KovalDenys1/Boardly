import { emailLanguageFromRequest } from '@/lib/email-language'

const request = (acceptLanguage?: string) => ({
  headers: new Headers(acceptLanguage === undefined ? {} : { 'accept-language': acceptLanguage }),
})

describe('emailLanguageFromRequest (#1298)', () => {
  it.each([
    ['nb-NO,nb;q=0.9,en;q=0.8', 'nb'],
    ['no', 'nb'],
    ['nn-NO', 'nb'],
    ['en-US,en;q=0.9,nb;q=0.8', 'en'],
    ['en;q=0.4,nb;q=0.9', 'nb'],
    ['en;Q=0.4,nb;Q=0.9', 'nb'],
    ['uk-UA,uk;q=0.9,ru;q=0.8', 'en'],
    ['de-DE', 'en'],
  ])('%s writes the mail in %s', (header, expected) => {
    expect(emailLanguageFromRequest(request(header))).toBe(expected)
  })

  it.each([undefined, '', '*', 'nb;q=0'])('knows no language from %p, so the mail keeps both', (header) => {
    expect(emailLanguageFromRequest(request(header))).toBeUndefined()
  })
})
