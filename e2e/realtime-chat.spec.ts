import type { Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { contextForGuest, createGuestLobby, joinAsGuest } from './support/lobby'
import { watchRealtimeSubscription } from './support/realtime'

/**
 * A guest who has not accepted the terms gets the consent panel where the composer
 * would be (#1466), and the server answers a chat post 403 TERMS_REQUIRED until they
 * do. The opponent is minted fresh by every test, so it is the one that writes: the
 * cached host may have accepted on an earlier run, and the panel would then never show.
 */
async function acceptTermsInChat(page: Page) {
  const accept = page.getByRole('button', { name: /accept and chat/i })
  await expect(accept).toBeVisible({ timeout: 20_000 })
  await expect(page.getByPlaceholder(/type a message/i)).toHaveCount(0)
  await accept.click()
  await expect(page.getByPlaceholder(/type a message/i)).toBeVisible()
}

/** The chat panel is open for a reader, whichever of the composer or the consent panel it shows. */
function chatFooter(page: Page) {
  return page.getByPlaceholder(/type a message/i).or(page.getByRole('button', { name: /accept and chat/i }))
}

/**
 * The two-window check that used to be done by hand.
 *
 * #801 changed chat from "broadcast the message" to "broadcast a signal, then
 * fetch the body from the gated endpoint", and #845 renamed every lobby topic
 * from `lobby:{code}` to `lobby:{code}:{secret}`. Both are invisible to the
 * Jest suite, which mocks Supabase: it can prove the payload shape and the
 * membership gates, but a client subscribed to the wrong topic raises no error
 * anywhere — the lobby just goes quiet. Only two real browsers can tell.
 */
test('a chat message written in one browser arrives in another', async ({ browser, request, baseURL }) => {
  const url = baseURL!
  // A role per test: one creator may hold only one open lobby, and none of these finishes its game.
  const { code, host } = await createGuestLobby(request, 'tic_tac_toe', url, 2, undefined, {
    hostRole: 'chat-relay-host',
  })
  const opponent = await joinAsGuest(request, code, url)

  const hostContext = await contextForGuest(browser, host)
  const opponentContext = await contextForGuest(browser, opponent)

  try {
    const hostPage = await hostContext.newPage()
    const opponentPage = await opponentContext.newPage()

    // Attach before navigating: the socket opens during load.
    const hostSubscribed = watchRealtimeSubscription(hostPage, code)
    const opponentSubscribed = watchRealtimeSubscription(opponentPage, code)

    await hostPage.goto(`/lobby/${code}`)
    await opponentPage.goto(`/lobby/${code}`)

    // Realtime broadcast has no replay, so a message sent before both sides
    // have joined would simply be lost. Waiting on the join acknowledgement is
    // also the direct evidence for #845: the topic each browser subscribed to
    // carries the lobby's secret rather than being the guessable bare name.
    const [hostTopic, opponentTopic] = await Promise.all([hostSubscribed, opponentSubscribed])
    expect(hostTopic).toBe(opponentTopic)
    expect(hostTopic).not.toBe(`lobby:${code}`)
    expect(hostTopic).toMatch(new RegExp(`^lobby:${code}:.+`))

    // Open the chat on both. Opening is what loads the history, so anything
    // that shows up afterwards can only have arrived over realtime — the panel
    // does not poll.
    for (const page of [hostPage, opponentPage]) {
      await page.getByRole('button', { name: /chat/i }).first().click()
    }

    const message = `hello from the opponent ${Date.now()}`
    await expect(chatFooter(hostPage)).toBeVisible()
    await acceptTermsInChat(opponentPage)
    const opponentChat = opponentPage.getByPlaceholder(/type a message/i)

    await opponentChat.fill(message)
    await opponentChat.press('Enter')

    // The sender sees it at once: it is added locally under a temp id.
    await expect(opponentPage.getByText(message)).toBeVisible()

    // The actual assertion. The other browser received only a signal on the
    // topic and had to fetch the body from GET /api/lobby/[code]/chat.
    await expect(hostPage.getByText(message)).toBeVisible({ timeout: 20_000 })
  } finally {
    await hostContext.close()
    await opponentContext.close()
  }
})

/**
 * The narrower half of the same question, and the one that would break first:
 * every player must be able to resolve the topic name at all. A 403 here means
 * the lobby is silently frozen for that person, with nothing on screen to say
 * so.
 */
test('every player in a lobby can resolve its realtime topic, and nobody else can', async ({ request, baseURL }) => {
  const url = baseURL!
  const { code, host } = await createGuestLobby(request, 'tic_tac_toe', url, 2, undefined, {
    hostRole: 'chat-topic-host',
  })
  const opponent = await joinAsGuest(request, code, url)

  for (const player of [host, opponent]) {
    const res = await request.get(`${url}/api/lobby/${code}/realtime-topic`, {
      headers: { 'X-Guest-Token': player.guestToken },
    })
    expect(res.status(), `${player.guestName} should be able to subscribe`).toBe(200)
    expect((await res.json()).topic).toMatch(new RegExp(`^lobby:${code}:.+`))
  }

  const anonymous = await request.get(`${url}/api/lobby/${code}/realtime-topic`)
  expect(anonymous.status(), 'a caller with no identity must be turned away').toBe(401)
})

/**
 * Chat history, which until #854 had nowhere to live.
 *
 * `getChatHistory()` is Redis-backed and returns an empty list when no
 * credentials are found. Production had credentials under a name the code did
 * not read, so history was always empty — and #801 had made that same empty
 * list the only delivery path, which is how #852 happened. Delivery no longer
 * depends on it, but a reload does: this is the assertion that the store is
 * really there.
 */
test('a message is still there after a reload', async ({ browser, request, baseURL }) => {
  const url = baseURL!
  const { code, host } = await createGuestLobby(request, 'tic_tac_toe', url, 2, undefined, {
    hostRole: 'chat-history-host',
  })
  const opponent = await joinAsGuest(request, code, url)

  const hostContext = await contextForGuest(browser, host)
  const opponentContext = await contextForGuest(browser, opponent)

  try {
    const hostPage = await hostContext.newPage()
    const opponentPage = await opponentContext.newPage()

    const opponentSubscribed = watchRealtimeSubscription(opponentPage, code)
    await hostPage.goto(`/lobby/${code}`)
    await opponentPage.goto(`/lobby/${code}`)
    await opponentSubscribed

    await opponentPage.getByRole('button', { name: /chat/i }).first().click()
    const message = `still here after a reload ${Date.now()}`
    await acceptTermsInChat(opponentPage)
    const opponentChat = opponentPage.getByPlaceholder(/type a message/i)

    // Wait for the server's answer, not for the message appearing on the
    // sender's screen: that copy is optimistic and shows up before the POST has
    // been handled, so reloading on it races the write into the store.
    const persisted = opponentPage.waitForResponse(
      (response) =>
        response.url().includes(`/api/lobby/${code}/chat`) &&
        response.request().method() === 'POST' &&
        response.ok()
    )
    await opponentChat.fill(message)
    await opponentChat.press('Enter')
    await persisted

    // A reload throws away everything the page held in memory, so whatever
    // comes back was read from the store.
    await hostPage.reload()
    await hostPage.getByRole('button', { name: /chat/i }).first().click()
    await expect(hostPage.getByText(message)).toBeVisible({ timeout: 20_000 })
  } finally {
    await hostContext.close()
    await opponentContext.close()
  }
})
