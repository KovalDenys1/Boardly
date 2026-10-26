import type { ErrorEvent, Event, spanToStaticSpanJSON } from '@sentry/nextjs'
import { stripQueryStrings, stripSpanQueryStrings } from '@/lib/sentry-data-collection'

type SpanJSON = ReturnType<typeof spanToStaticSpanJSON>

/**
 * Query strings carry secrets on this site: the unsubscribe link's signed token, the OAuth
 * callback's code and state, a reset link's token. Next.js and the SDK put URLs in places no
 * `dataCollection` setting reaches (`http.target`, stack frames, long-frame and LCP spans,
 * error messages), so every string of every event, transaction and span is stripped of the
 * query and fragment of any URL in it before it is sent.
 */
const UNSUBSCRIBE = 'https://boardly.online/api/notifications/unsubscribe?token=tttttttt'
const OAUTH_CALLBACK = 'https://boardly.online/api/auth/callback/discord?code=cccccccc&state=ssssssss'
const SECRETS = ['tttttttt', 'cccccccc', 'ssssssss', 'rrrrrrrr']

function leaked(value: unknown): string[] {
  const text = JSON.stringify(value)
  return SECRETS.filter((secret) => text.includes(secret))
}

describe('stripQueryStrings on a transaction', () => {
  function unsubscribeTransaction(): Event {
    return {
      type: 'transaction',
      transaction: 'GET /api/notifications/unsubscribe',
      request: {
        url: UNSUBSCRIBE,
        query_string: 'token=tttttttt',
        method: 'GET',
        headers: { referer: 'https://boardly.online/profile?code=rrrrrrrr' },
      },
      contexts: {
        trace: {
          trace_id: '2'.repeat(32),
          span_id: '3'.repeat(16),
          data: {
            'http.method': 'GET',
            'http.target': '/api/notifications/unsubscribe?token=tttttttt',
            'http.request.header.referer': ['https://boardly.online/profile?code=rrrrrrrr'],
          },
        },
      },
      spans: [
        {
          span_id: '1'.repeat(16),
          trace_id: '2'.repeat(32),
          start_timestamp: 1,
          status: 'ok',
          data: {
            'url.full': UNSUBSCRIBE,
            'http.url': UNSUBSCRIBE,
            url: UNSUBSCRIBE,
            'http.query': '?token=tttttttt',
            'url.query': 'token=tttttttt',
          },
        },
      ],
    }
  }

  it('leaves no query string anywhere in it', () => {
    expect(leaked(stripQueryStrings(unsubscribeTransaction()))).toEqual([])
  })

  it('keeps the path, so the transaction still says which route ran', () => {
    const event = stripQueryStrings(unsubscribeTransaction())
    expect(event.contexts?.trace?.data?.['http.target']).toBe('/api/notifications/unsubscribe')
    expect(event.request?.url).toBe('https://boardly.online/api/notifications/unsubscribe')
    expect(event.spans?.[0].data['url.full']).toBe('https://boardly.online/api/notifications/unsubscribe')
    expect(event.contexts?.trace?.data?.['http.method']).toBe('GET')
  })

  it('cuts a query out of the transaction name', () => {
    const event = stripQueryStrings({ type: 'transaction', transaction: 'GET /api/notifications/unsubscribe?token=tttttttt' })
    expect(event.transaction).toBe('GET /api/notifications/unsubscribe')
  })
})

describe('stripQueryStrings on an error', () => {
  function oauthCallbackError(): ErrorEvent {
    return {
      type: undefined,
      request: {
        url: OAUTH_CALLBACK,
        query_string: 'code=cccccccc&state=ssssssss',
        headers: { Referer: 'https://boardly.online/auth/login?code=rrrrrrrr' },
      },
      contexts: { nextjs: { request_path: '/api/auth/callback/discord?code=cccccccc&state=ssssssss' } },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/auth/login?code=rrrrrrrr', to: '/api/auth/callback/discord?code=cccccccc' } },
        { category: 'fetch', data: { url: `${OAUTH_CALLBACK}#state=ssssssss`, method: 'GET' } },
        { category: 'http', data: { url: 'https://discord.com/api/oauth2/token', 'http.query': 'code=cccccccc' } },
      ],
    }
  }

  it('leaves no query string anywhere in it', () => {
    expect(leaked(stripQueryStrings(oauthCallbackError()))).toEqual([])
  })

  it('keeps the page and the breadcrumb trail without their queries', () => {
    const event = stripQueryStrings(oauthCallbackError())
    expect(event.request?.url).toBe('https://boardly.online/api/auth/callback/discord')
    expect(event.request).not.toHaveProperty('query_string')
    expect(event.breadcrumbs?.[0].data).toEqual({ from: '/auth/login', to: '/api/auth/callback/discord' })
    expect(event.breadcrumbs?.[1].data?.method).toBe('GET')
  })
})

describe('stripSpanQueryStrings', () => {
  it('cuts the query from an outgoing request span and its attributes', () => {
    const span = stripSpanQueryStrings({
      span_id: '1'.repeat(16),
      trace_id: '2'.repeat(32),
      start_timestamp: 1,
      status: 'ok',
      op: 'http.client',
      description: 'GET https://discord.com/api/oauth2/token?code=cccccccc',
      data: { 'http.query': 'code=cccccccc', 'url.full': 'https://discord.com/api/oauth2/token?code=cccccccc' },
    } as SpanJSON)
    expect(leaked(span)).toEqual([])
    expect(span.description).toBe('GET https://discord.com/api/oauth2/token')
  })

  it('cuts the query from a browser timing span, which is named after the page URL', () => {
    const span = stripSpanQueryStrings({
      span_id: '1'.repeat(16),
      trace_id: '2'.repeat(32),
      start_timestamp: 1,
      status: 'ok',
      op: 'browser.request',
      description: 'https://boardly.online/api/auth/callback/discord?code=cccccccc',
      data: {},
    } as SpanJSON)
    expect(span.description).toBe('https://boardly.online/api/auth/callback/discord')
  })

  it('leaves a database span alone, where a question mark is a bound parameter', () => {
    const description = 'SELECT "id" FROM "Users" WHERE "email" = ?'
    const span = stripSpanQueryStrings({
      span_id: '1'.repeat(16),
      trace_id: '2'.repeat(32),
      start_timestamp: 1,
      status: 'ok',
      op: 'db',
      description,
      data: {},
    } as SpanJSON)
    expect(span.description).toBe(description)
  })
})

describe('stripQueryStrings on any URL, wherever the SDK put it', () => {
  // Independent of the implementation: an absolute, app:/// or root-relative URL followed by ? or #.
  const URL_WITH_QUERY = /(?:[a-z][a-z0-9+.-]*:\/\/|(?:^|[\s"'(=,])\/)[^\s"'<>()?#]*[?#]/i

  function urlsWithQuery(value: unknown): string[] {
    const found: string[] = []
    JSON.stringify(value, (_key, item) => {
      if (typeof item === 'string' && URL_WITH_QUERY.test(item)) found.push(item)
      return item
    })
    return found
  }

  const CHUNK = 'app:///_next/static/chunks/03f7pyerwz6os.js?dpl=dpl_xxxxxxxx'

  it('cuts the deployment query from stack frames and from the debug images that name them', () => {
    const event = stripQueryStrings({
      exception: {
        values: [{ type: 'Error', value: 'boom', stacktrace: { frames: [{ filename: CHUNK, abs_path: CHUNK, lineno: 6, colno: 7926 }] } }],
      },
      debug_meta: { images: [{ type: 'sourcemap', code_file: CHUNK, debug_id: '00000000-0000-0000-0000-000000000000' }] },
    } as ErrorEvent)
    expect(urlsWithQuery(event)).toEqual([])
    const frame = event.exception?.values?.[0].stacktrace?.frames?.[0]
    const image = event.debug_meta?.images?.[0] as { code_file: string }
    expect(frame?.abs_path).toBe('app:///_next/static/chunks/03f7pyerwz6os.js')
    expect(image.code_file).toBe(frame?.abs_path)
  })

  it('keeps line and column when it cuts a query inside a stack trace string', () => {
    const stack = [
      'Error: boom',
      '    at n (https://boardly.online/_next/static/chunks/03f7pyerwz6os.js?dpl=dpl_xxxxxxxx:6:7926)',
      '    at https://boardly.online/auth/reset-password?token=tttttttt#frag:1:42',
    ].join('\n')
    const event = stripQueryStrings({ breadcrumbs: [{ category: 'console', data: { arguments: [{ stack }] } }] })
    expect(event.breadcrumbs?.[0].data?.arguments[0].stack).toBe(
      [
        'Error: boom',
        '    at n (https://boardly.online/_next/static/chunks/03f7pyerwz6os.js:6:7926)',
        '    at https://boardly.online/auth/reset-password:1:42',
      ].join('\n'),
    )
  })

  it('cuts the query from the scripts a long animation frame span names', () => {
    const span = stripSpanQueryStrings({
      span_id: '1'.repeat(16),
      trace_id: '2'.repeat(32),
      start_timestamp: 1,
      status: 'ok',
      op: 'ui.long-animation-frame',
      description: 'Main UI thread blocked',
      data: {
        'browser.script.invoker': 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-xxxxxxxx',
        'browser.script.source_url': 'https://boardly.online/auth/reset-password?token=tttttttt#frag',
        'code.file.path': 'https://boardly.online/_next/static/chunks/3v_upxfx4f2_x.js?dpl=dpl_xxxxxxxx',
        'browser.script.invoker_type': 'classic-script',
      },
    } as SpanJSON)
    expect(urlsWithQuery(span)).toEqual([])
    expect(span.data['code.file.path']).toBe('https://boardly.online/_next/static/chunks/3v_upxfx4f2_x.js')
    expect(span.data['browser.script.invoker_type']).toBe('classic-script')
  })

  it('cuts the query from the LCP element URL, on the pageload and on its own span', () => {
    const image = 'https://boardly.online/_next/image?url=%2Fscreenshots%2Fyahtzee-desktop.png&w=828&q=75'
    const pageload = stripQueryStrings({ type: 'transaction', contexts: { trace: { trace_id: '2'.repeat(32), span_id: '3'.repeat(16), data: { 'lcp.url': image } } } })
    const lcp = stripSpanQueryStrings({
      span_id: '1'.repeat(16),
      trace_id: '2'.repeat(32),
      start_timestamp: 1,
      status: 'ok',
      op: 'ui.webvital.lcp',
      data: { 'browser.web_vital.lcp.url': image },
    } as SpanJSON)
    expect(pageload.contexts?.trace?.data?.['lcp.url']).toBe('https://boardly.online/_next/image')
    expect(lcp.data['browser.web_vital.lcp.url']).toBe('https://boardly.online/_next/image')
  })

  it('keeps an error message and cuts only the query of the URL inside it', () => {
    const event = stripQueryStrings({
      exception: {
        values: [{ type: 'Error', value: 'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message' }],
      },
    })
    expect(event.exception?.values?.[0].value).toBe('Minified React error #418; visit https://react.dev/errors/418 for the full message')
  })

  it('cuts the page URL the browser gives an inline script frame or a thrown non-Error', () => {
    const event = stripQueryStrings({
      request: { url: 'https://boardly.online/auth/reset-password?token=tttttttt#frag' },
      exception: {
        values: [
          { type: 'Error', value: 'inline', stacktrace: { frames: [{ filename: 'https://boardly.online/auth/reset-password?token=tttttttt#frag', lineno: 1 }] } },
          { type: 'Error', value: 'not-an-error', stacktrace: { frames: [{ filename: 'app:///auth/reset-password?token=tttttttt#frag', function: '?' }] } },
        ],
      },
    })
    expect(urlsWithQuery(event)).toEqual([])
    expect(JSON.stringify(event)).not.toContain('tttttttt')
    expect(JSON.stringify(event)).not.toContain('#frag')
  })

  it('leaves a CSS selector and a hash in prose alone', () => {
    const span = stripSpanQueryStrings({
      span_id: '1'.repeat(16),
      trace_id: '2'.repeat(32),
      start_timestamp: 1,
      status: 'ok',
      op: 'ui.interaction.click',
      description: 'body > div#root > button.primary',
      data: { 'browser.web_vital.inp.target': 'body > div#root > button.primary' },
    } as SpanJSON)
    expect(span.description).toBe('body > div#root > button.primary')
    expect(span.data['browser.web_vital.inp.target']).toBe('body > div#root > button.primary')
  })

  it('never throws, whatever the event holds', () => {
    const cyclic: Record<string, unknown> = { url: 'https://boardly.online/a?token=tttttttt' }
    cyclic.self = cyclic
    let deep: Record<string, unknown> = { url: '/deep?token=tttttttt' }
    for (let i = 0; i < 500; i++) deep = { next: deep }
    const odd = [
      { request: { url: new URL('https://boardly.online/c?token=tttttttt') } },
      { request: { url: 42, headers: { referer: ['https://boardly.online/r?token=tttttttt', 5, null] } } },
      { tags: { url: 'https://boardly.online/t?token=tttttttt', n: 1 }, contexts: { trace: { data: null } } },
      { breadcrumbs: [{ data: 'str' }, { data: null }, {}, { data: { url: { href: 'https://x.y/z?token=tttttttt' } } }] },
      { extra: { frozen: Object.freeze({ url: 'https://boardly.online/f?token=tttttttt' }) } },
      { extra: { cyclic } },
      { extra: { deep } },
      { request: { url: 'about:blank' } },
    ]
    for (const event of odd) {
      expect(() => stripQueryStrings(event as never)).not.toThrow()
    }
    expect(stripQueryStrings(odd[0] as never)).toEqual({ request: { url: 'https://boardly.online/c' } })
    expect(cyclic.url).toBe('https://boardly.online/a')
  })
})

describe('stripQueryStrings on a query that runs on', () => {
  const strip = (text: string) => (stripSpanQueryStrings({ data: { text } } as unknown as SpanJSON).data as { text: string }).text

  it('cuts the whole query even when it holds parentheses', () => {
    expect(strip('https://boardly.online/api/notifications/unsubscribe?utm_campaign=digest(oct)&token=tttttttt')).toBe(
      'https://boardly.online/api/notifications/unsubscribe',
    )
  })

  it('cuts digits after a colon that are part of the query, not a frame position', () => {
    expect(strip('GET https://boardly.online/reset?token=tttttttt:123456 failed')).toBe('GET https://boardly.online/reset failed')
  })

  it('keeps the position of a stack frame in parentheses', () => {
    expect(strip('    at n (app:///x.js?dpl=y:1:2)')).toBe('    at n (app:///x.js:1:2)')
    expect(strip('    at n (app:///x.js?dpl=y)')).toBe('    at n (app:///x.js)')
  })

  it('cuts a string over 32 KB at its first query', () => {
    const long = 'see https://boardly.online/reset?token=tttttttt then ' + 'z'.repeat(40_000)
    expect(strip(long)).toBe('see https://boardly.online/reset')
  })
})

describe('stripQueryStrings in linear time', () => {
  const SIZE = 100_000
  const strip = (text: string) => stripSpanQueryStrings({ data: { text } } as unknown as SpanJSON)

  it.each([
    ['"? " + "=/" repeated', '? ' + '=/'.repeat(SIZE / 2)],
    ['"?" + "a." repeated', '?' + 'a.'.repeat(SIZE / 2)],
    ['"?" + "a://" repeated', '?' + 'a://'.repeat(SIZE / 4)],
    ['",/" repeated + "\'?"', ',/'.repeat(SIZE / 2) + "'?"],
    ['"[/" repeated + " #"', '[/'.repeat(SIZE / 2) + ' #'],
    ['"(/" repeated + "?"', '(/'.repeat(SIZE / 2) + '?'],
    ['"/a?" + ":1" repeated + "x"', '/a?' + ':1'.repeat(SIZE / 2) + 'x'],
    ['"/a?" + "1" repeated', '/a?' + '1'.repeat(SIZE)],
    ['"/" repeated + "?"', '/'.repeat(SIZE) + '?'],
    ['" /?" repeated', ' /?'.repeat(SIZE / 3)],
    ['a crafted 13.8 KB path', '/x/' + '=/'.repeat(6900) + '(?a'],
  ])('handles %s at 100 KB in under 50 ms', (_label, text) => {
    strip(text)
    const started = performance.now()
    strip(text)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('handles a 15 KB User-Agent copied into four places of one event in under 50 ms', () => {
    const agent = '? ' + '=/'.repeat(7500)
    const event = {
      request: { headers: { 'user-agent': agent } },
      contexts: { trace: { data: { 'http.request.header.user_agent': [agent], 'user_agent.original': agent } } },
      tags: { ua: agent },
    }
    const started = performance.now()
    stripQueryStrings(event as never)
    expect(performance.now() - started).toBeLessThan(50)
  })
})

describe('stripQueryStrings leaves what the SDK never sends', () => {
  it('does not touch sdkProcessingMetadata, which holds the live client options and logged objects', () => {
    const options = { tunnel: '/monitoring?o=1&p=2&r=de' }
    const logged = { text: 'join me https://boardly.online/lobby/AB12?invite=iiiiiiii', meta: { query_string: 'invite=iiiiiiii' } }
    const event = stripQueryStrings({
      request: { url: 'https://boardly.online/lobby/AB12?invite=iiiiiiii' },
      sdkProcessingMetadata: { capturedSpanScope: { client: { options }, breadcrumbs: [{ data: { arguments: [logged] } }] } },
    } as never) as { request: { url: string } }
    expect(event.request.url).toBe('https://boardly.online/lobby/AB12')
    expect(options.tunnel).toBe('/monitoring?o=1&p=2&r=de')
    expect(logged).toEqual({ text: 'join me https://boardly.online/lobby/AB12?invite=iiiiiiii', meta: { query_string: 'invite=iiiiiiii' } })
  })
})
