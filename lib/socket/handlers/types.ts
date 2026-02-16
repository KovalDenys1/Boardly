export interface SocketUserContext {
  id: string
  username?: string | null
  email?: string | null
  isGuest?: boolean
  bot?: unknown
}

export interface SocketDataWithUser {
  user: SocketUserContext
  authorizedLobbies?: Set<string>
}

export interface SocketDataWithOptionalUser {
  user?: SocketUserContext
  authorizedLobbies?: Set<string>
}

export interface EmitsToSelf {
  id: string
  emit: (event: string, payload?: unknown) => void
}

export interface EmitsToRoom {
  to: (room: string) => {
    emit: (event: string, payload?: unknown) => void
  }
}

export interface JoinsRooms {
  join: (room: string) => void
}

export interface LeavesRooms {
  leave: (room: string) => void
}

export interface TracksRooms {
  rooms: Iterable<string>
}

export interface HasRoomSet {
  rooms: Set<string>
}

export interface SocketWithUser {
  id: string
  data: SocketDataWithUser
}

export interface SocketWithOptionalUser {
  id: string
  data: SocketDataWithOptionalUser
}

export type JoinLobbySocket = SocketWithUser & JoinsRooms & EmitsToSelf
export type GameActionSocket = SocketWithUser & EmitsToSelf & EmitsToRoom & HasRoomSet
export type SendChatMessageSocket = SocketWithUser & EmitsToSelf & HasRoomSet
export type PlayerTypingSocket = SocketWithUser & EmitsToRoom & HasRoomSet
export type LeaveLobbySocket = SocketWithUser & LeavesRooms
export type LobbyListMembershipSocket = { id: string } & JoinsRooms & LeavesRooms
export type ConnectionLifecycleSocket = SocketWithOptionalUser & TracksRooms
export type ForbiddenClientEventSocket = SocketWithOptionalUser & EmitsToSelf
export type SocketErrorContext = { id: string }

export type EmitSocketErrorFn = (
  socket: EmitsToSelf,
  code: string,
  message: string,
  translationKey?: string,
  details?: Record<string, unknown>
) => void
