import type { FriendPresence } from '@/hooks/useFriendPresence'

export interface Friend {
  id: string
  username: string | null
  avatar: string | null
  publicProfileId: string | null
  friendshipId: string
  friendsSince: string
  isPremium?: boolean
  presence?: FriendPresence
}

export interface FriendRequest {
  id: string
  senderId: string
  /** Absent when the receiver's profile is hidden from the sender (#1226). */
  receiverId?: string
  status: string
  createdAt: string
  sender?: {
    id: string
    username: string | null
    avatar: string | null
  }
  receiver?: {
    /** Absent when the receiver's profile is hidden from the sender (#1226); the name and picture are public. */
    id?: string
    username: string | null
    avatar: string | null
  }
}

/** Inside the box, so an `overflow` ancestor cannot clip it (DESIGN.md, Contrast). */
export const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep'

/** `.bd-btn` has no disabled state yet (#1553): no lift, no press, no pointer. */
export const DISABLED_BUTTON = 'disabled:pointer-events-none disabled:opacity-60'
