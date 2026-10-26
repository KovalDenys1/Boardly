/**
 * @sentry/nextjs 11 collects user info, cookies, HTTP bodies and database query data when
 * `dataCollection` is left unset. Each runtime has its own `Sentry.init`, so each one is read
 * here with the SDK mocked, and must pass the block the migration guide gives for keeping v10's
 * collection ("If you want to keep the v10 default behavior"), and strip query strings from
 * everything it sends.
 */
const mockInit = jest.fn()

jest.mock('@sentry/nextjs', () => ({
  init: (options: unknown) => mockInit(options),
  captureRouterTransitionStart: jest.fn(),
  withStaticSpan: (callback: (span: unknown) => unknown) =>
    Object.assign((span: unknown) => callback(span), { wrappedForStaticLifecycle: true }),
}))
jest.mock('botid/client/core', () => ({ initBotId: jest.fn() }))

const PII_KEY_SNIPPETS = ['forwarded', '-ip', 'remote-', 'via', '-user']
const UNSUBSCRIBE = 'https://boardly.online/api/notifications/unsubscribe?token=tttttttt'

const V10_EQUIVALENT_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: PII_KEY_SNIPPETS },
    response: { deny: PII_KEY_SNIPPETS },
  },
  httpBodies: [],
  urlQueryParams: { deny: PII_KEY_SNIPPETS },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
}

function initOptions(modulePath: string): Record<string, unknown> {
  mockInit.mockClear()
  jest.isolateModules(() => {
    require(modulePath)
  })
  expect(mockInit).toHaveBeenCalledTimes(1)
  return mockInit.mock.calls[0][0]
}

describe.each([
  ['server', '../sentry.server.config'],
  ['edge', '../sentry.edge.config'],
  ['client', '../instrumentation-client'],
])('Sentry.init on the %s', (_runtime, modulePath) => {
  it('collects no more than v10 did', () => {
    expect(initOptions(modulePath).dataCollection).toEqual(V10_EQUIVALENT_DATA_COLLECTION)
  })

  it('keeps sending transactions rather than streamed spans', () => {
    expect(initOptions(modulePath).traceLifecycle).toBe('static')
  })

  it('passes none of the options v11 removed', () => {
    const options = initOptions(modulePath)
    expect(options).not.toHaveProperty('sendDefaultPii')
    expect(options).not.toHaveProperty('enableLogs')
  })

  it('sends no query string with an error', () => {
    const beforeSend = initOptions(modulePath).beforeSend as (event: object) => object | null
    const sent = beforeSend({ request: { url: `${UNSUBSCRIBE}`, query_string: 'token=tttttttt' } })
    expect(JSON.stringify(sent)).not.toContain('tttttttt')
  })

  it('sends no query string with a transaction', () => {
    const beforeSendTransaction = initOptions(modulePath).beforeSendTransaction as (event: object) => object | null
    const sent = beforeSendTransaction({
      type: 'transaction',
      contexts: { trace: { data: { 'http.target': '/api/auth/callback/discord?code=cccccccc' } } },
    })
    expect(JSON.stringify(sent)).not.toContain('cccccccc')
  })

  it('sends no query string with a span sent on its own', () => {
    const beforeSendSpan = initOptions(modulePath).beforeSendSpan as ((span: object) => object) & {
      wrappedForStaticLifecycle?: boolean
    }
    expect(beforeSendSpan.wrappedForStaticLifecycle).toBe(true)
    const sent = beforeSendSpan({ data: { 'url.full': UNSUBSCRIBE } })
    expect(JSON.stringify(sent)).not.toContain('tttttttt')
  })
})

it('still drops a browser extension error on the client', () => {
  const beforeSend = initOptions('../instrumentation-client').beforeSend as (event: object) => object | null
  const fromExtension = {
    exception: { values: [{ stacktrace: { frames: [{ filename: 'chrome-extension://abc/content.js' }] } }] },
  }
  expect(beforeSend(fromExtension)).toBeNull()
})
