export interface TourStep {
  id: string
  route: string
  selector?: string
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  authOnly?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome', route: '/games', placement: 'center' },
  { id: 'games_grid', route: '/games', selector: 'games-grid', placement: 'bottom' },
  { id: 'create_lobby', route: '/lobby', selector: 'create-lobby', placement: 'left' },
  { id: 'lobby_filters', route: '/lobby', selector: 'lobby-filters', placement: 'top' },
  { id: 'profile_stats', route: '/profile', selector: 'profile-stats', placement: 'top', authOnly: true },
]
