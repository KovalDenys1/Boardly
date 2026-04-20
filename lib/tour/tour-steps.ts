import type { TranslationKeys } from '@/lib/i18n-helpers'

export interface TourStep {
  id: string
  route: string
  selector: string | null
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  authOnly: boolean
  titleKey: TranslationKeys
  descriptionKey: TranslationKeys
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    selector: null,
    placement: 'center',
    authOnly: false,
    titleKey: 'tour.steps.welcome.title',
    descriptionKey: 'tour.steps.welcome.description',
  },
  {
    id: 'games',
    route: '/games',
    selector: '[data-tour-step="games-grid"]',
    placement: 'bottom',
    authOnly: false,
    titleKey: 'tour.steps.games.title',
    descriptionKey: 'tour.steps.games.description',
  },
  {
    id: 'create-lobby',
    route: '/lobby',
    selector: '[data-tour-step="create-lobby"]',
    placement: 'left',
    authOnly: false,
    titleKey: 'tour.steps.createLobby.title',
    descriptionKey: 'tour.steps.createLobby.description',
  },
  {
    id: 'find-lobbies',
    route: '/lobby',
    selector: '[data-tour-step="lobby-filters"]',
    placement: 'bottom',
    authOnly: false,
    titleKey: 'tour.steps.findLobbies.title',
    descriptionKey: 'tour.steps.findLobbies.description',
  },
  {
    id: 'profile',
    route: '/profile',
    selector: '[data-tour-step="profile-stats"]',
    placement: 'top',
    authOnly: true,
    titleKey: 'tour.steps.profile.title',
    descriptionKey: 'tour.steps.profile.description',
  },
  {
    id: 'quick-start',
    route: null as unknown as string,
    selector: null,
    placement: 'center',
    authOnly: false,
    titleKey: 'tour.steps.quickStart.title',
    descriptionKey: 'tour.steps.quickStart.description',
  },
]
