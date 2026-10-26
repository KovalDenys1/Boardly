import { act, render } from '@testing-library/react'
import type { AnalyticsProps, BeforeSendEvent } from '@vercel/analytics/react'
import DeferredTelemetry from '@/components/DeferredTelemetry'
import { APP_SHELL_PLAY } from '@/lib/app-shell'

const mockAnalyticsProps = jest.fn()
jest.mock('@vercel/analytics/react', () => ({
  Analytics: (props: AnalyticsProps) => {
    mockAnalyticsProps(props)
    return null
  },
}))
jest.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }))

function renderedBeforeSend(): (event: BeforeSendEvent) => BeforeSendEvent | null {
  jest.useFakeTimers()
  render(<DeferredTelemetry />)
  act(() => {
    jest.runAllTimers()
  })
  const props = mockAnalyticsProps.mock.calls.at(-1)?.[0] as AnalyticsProps | undefined
  expect(props?.beforeSend).toEqual(expect.any(Function))
  return props!.beforeSend!
}

afterEach(() => {
  jest.useRealTimers()
  mockAnalyticsProps.mockClear()
  delete document.documentElement.dataset.appShell
  sessionStorage.clear()
})

describe('DeferredTelemetry: Analytics events from the Play app (#1471)', () => {
  it('puts the Play app\'s UTM pair back on the event URL', () => {
    document.documentElement.dataset.appShell = APP_SHELL_PLAY
    const beforeSend = renderedBeforeSend()

    const sent = beforeSend({ type: 'pageview', url: `${window.location.origin}/games/yahtzee?lang=no` })

    const url = new URL(sent!.url)
    expect(url.pathname).toBe('/games/yahtzee')
    expect(url.searchParams.get('lang')).toBe('no')
    expect(url.searchParams.get('utm_source')).toBe('android_app')
    expect(url.searchParams.get('utm_medium')).toBe('twa')
  })

  it('leaves a web event as it is', () => {
    const beforeSend = renderedBeforeSend()
    const event: BeforeSendEvent = { type: 'pageview', url: `${window.location.origin}/games/yahtzee?lang=no` }

    expect(beforeSend(event)).toEqual(event)
  })
})
