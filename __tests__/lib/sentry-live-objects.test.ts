import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION, stripQueryStrings, stripSpanQueryStrings } from '@/lib/sentry-data-collection'

/**
 * The hooks run on the real browser SDK here. An event carries `sdkProcessingMetadata`, which
 * the SDK never sends and which holds live objects: the scope, the client and its options, and
 * the arguments of logged calls. Stripping must leave all of them as they were.
 */
const TUNNEL = '/monitoring?o=1&p=2&r=de'

it('leaves the client options and a logged object alone while it strips what is sent', async () => {
  const sent: string[] = []
  const silenced = jest.spyOn(console, 'error').mockImplementation(() => {})
  Sentry.init({
    dsn: 'https://00000000000000000000000000000000@o1.ingest.de.sentry.io/1',
    tunnel: TUNNEL,
    tracesSampleRate: 1,
    // jsdom has no performance.getEntriesByType for its web vitals; the test makes its own transaction.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserTracing'),
    traceLifecycle: 'static',
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: stripQueryStrings,
    beforeSendTransaction: stripQueryStrings,
    beforeSendSpan: Sentry.withStaticSpan(stripSpanQueryStrings),
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope))
        return {}
      },
      flush: async () => true,
    }),
  })

  const logged = { text: 'join me https://boardly.online/lobby/AB12?invite=iiiiiiii', meta: { query_string: 'invite=iiiiiiii' } }
  const before = JSON.stringify(logged)
  console.error('Realtime handler threw', { event: logged })
  Sentry.startSpan({ name: '/lobby/[code]', op: 'navigation', forceTransaction: true }, () => {})
  Sentry.captureException(new Error('probe'))
  await Sentry.flush(2000)

  expect(Sentry.getClient()?.getOptions().tunnel).toBe(TUNNEL)
  expect(JSON.stringify(logged)).toBe(before)
  expect(sent.some((envelope) => envelope.includes('"probe"'))).toBe(true)
  expect(sent.join('\n')).not.toContain('iiiiiiii')

  await Sentry.close()
  silenced.mockRestore()
})
