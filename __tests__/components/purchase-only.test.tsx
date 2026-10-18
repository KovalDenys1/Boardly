import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { render } from '@testing-library/react'
import { PlayAppOnly, PurchaseOnly } from '@/components/PurchaseOnly'
import { APP_SHELL_STORAGE_KEY } from '@/lib/app-shell'

describe('PurchaseOnly and PlayAppOnly', () => {
  afterEach(() => {
    delete document.documentElement.dataset.appShell
    sessionStorage.clear()
    document.body.innerHTML = ''
    jest.restoreAllMocks()
  })

  it('PurchaseOnly renders its child inside a data-purchase-ui wrapper on the web', () => {
    const { container, getByText } = render(
      <PurchaseOnly>
        <button>Buy</button>
      </PurchaseOnly>
    )

    expect(getByText('Buy')).toBeInTheDocument()
    expect(container.querySelector('[data-purchase-ui]')).toContainElement(getByText('Buy'))
  })

  it('PurchaseOnly renders nothing in the Play app', () => {
    document.documentElement.dataset.appShell = 'play'
    const { container, queryByText } = render(
      <PurchaseOnly>
        <button>Buy</button>
      </PurchaseOnly>
    )

    expect(queryByText('Buy')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('PurchaseOnly renders nothing when React has stripped the attribute from a Play app tab', () => {
    sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')
    const { container } = render(
      <PurchaseOnly>
        <button>Buy</button>
      </PurchaseOnly>
    )

    expect(document.documentElement.dataset.appShell).toBeUndefined()
    expect(container).toBeEmptyDOMElement()
  })

  it('PlayAppOnly renders nothing on the web', () => {
    const { container } = render(
      <PlayAppOnly>
        <p>Manage on the web</p>
      </PlayAppOnly>
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('PlayAppOnly renders its child in the Play app', () => {
    document.documentElement.dataset.appShell = 'play'
    const { getByText } = render(
      <PlayAppOnly>
        <p>Manage on the web</p>
      </PlayAppOnly>
    )

    expect(getByText('Manage on the web')).toBeInTheDocument()
  })

  it('hydrates server markup into the Play app without a mismatch and drops the purchase child', async () => {
    const tree = (
      <PurchaseOnly>
        <button>Buy</button>
      </PurchaseOnly>
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.appendChild(container)
    expect(container.textContent).toBe('Buy')

    document.documentElement.dataset.appShell = 'play'
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, tree)
    })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
    await act(async () => root?.unmount())
  })
})
