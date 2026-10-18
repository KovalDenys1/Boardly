import { render, screen } from '@testing-library/react'
import AvatarPicker from '@/components/AvatarPicker'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ update: jest.fn() }),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { success: jest.fn(), error: jest.fn() },
}))

function renderFreePicker() {
  return render(
    <AvatarPicker
      currentAvatarUrl={null}
      currentImage={null}
      username="Player One"
      email="user@example.com"
      hasUploadPack={false}
      onSaved={jest.fn()}
      onUnlockUpload={jest.fn()}
    />
  )
}

describe('AvatarPicker in the Play app (#1465)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.appShell
  })

  it('offers no Get Premium button inside the app, and still lets a free user pick an avatar', () => {
    document.documentElement.dataset.appShell = 'play'
    renderFreePicker()

    expect(screen.queryByRole('button', { name: 'profile.avatarPicker.getPremium' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'profile.avatarPicker.avatarAlt' }).length).toBeGreaterThan(0)
  })

  it('keeps the Get Premium button on the web', () => {
    renderFreePicker()

    expect(screen.getByRole('button', { name: 'profile.avatarPicker.getPremium' })).toBeInTheDocument()
  })
})
