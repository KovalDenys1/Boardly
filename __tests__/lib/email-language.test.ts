import { emailLanguageFor, emailLanguageFromLocale, emailLanguageFromRequest } from '@/lib/email-language'

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

  it.each([undefined, '', '*', 'nb;q=0'])('writes in English when %p names no language (#1331)', (header) => {
    expect(emailLanguageFromRequest(request(header))).toBe('en')
  })
})

describe('emailLanguageFromLocale (#1331)', () => {
  it.each([
    ['no', 'nb'],
    ['en', 'en'],
    ['ru', 'en'],
    ['uk', 'en'],
    [null, 'en'],
    [undefined, 'en'],
    ['xx', 'en'],
  ])('writes a mail to an account stored as %p in %s', (locale, expected) => {
    expect(emailLanguageFromLocale(locale)).toBe(expected)
  })
})

describe('emailLanguageFor (#1331)', () => {
  it('prefers the stored language over Accept-Language', () => {
    expect(emailLanguageFor('en', request('nb-NO,nb;q=0.9'))).toBe('en')
    expect(emailLanguageFor('no', request('en-US,en;q=0.9'))).toBe('nb')
    expect(emailLanguageFor('ru', request('nb-NO'))).toBe('en')
  })

  it('falls back to Accept-Language when the account has no stored language', () => {
    expect(emailLanguageFor(null, request('nb-NO'))).toBe('nb')
    expect(emailLanguageFor(undefined, request('de-DE'))).toBe('en')
  })
})
