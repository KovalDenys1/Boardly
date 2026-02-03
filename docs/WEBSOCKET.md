# WebSocket Implementation Guide

**Last Updated**: February 3, 2026  
**Status**: ✅ Production Ready

---

## Overview

Boardly uses a dual-server architecture with Socket.IO for real-time communication:
- **Next.js** (port 3000): HTTP/API routes, SSR
- **Socket.IO** (port 3001): WebSocket server for real-time updates

All WebSocket events are type-safe and centralized in `types/socket-events.ts`.

---

## Quick Start

### Client-Side

```typescript
import { SocketEvents, GameUpdatePayload, SocketRooms } from '@/types/socket-events'

// 1. Connect
const { socket, isConnected, emitWhenConnected } = useSocketConnection({
  code: 'ABC123',
  session,
  isGuest: false,
  guestId: '',
  guestName: '',
  onGameUpdate: (data: GameUpdatePayload) => {
    console.log('Game updated:', data.action)
  },
  onStateSync: async () => {
    await loadLobby() // Refresh data after reconnection
  }
})

// 2. Listen to events
socket.on(SocketEvents.GAME_UPDATE, (data: GameUpdatePayload) => {
  // Handle game update
})

// 3. Emit events
emitWhenConnected(SocketEvents.SEND_CHAT_MESSAGE, {
  lobbyCode: code,
  message: 'Hello!',
  userId,
  username
})
```

### Server-Side

```typescript
import { SocketEvents, SocketRooms, emitWithMetadata, emitError } from './types/socket-events'

// 1. Emit with metadata (adds sequenceId, timestamp)
emitWithMetadata(
  io,
  SocketRooms.lobby(lobbyCode),
  SocketEvents.GAME_UPDATE,
  { action: 'state-change', payload: gameData }
)

// 2. Send structured error
emitError(
  socket,
  'LOBBY_NOT_FOUND',
  'Lobby not found',
  'errors.lobbyNotFound',
  { lobbyCode }
)
```

---

## Key Features

### ✅ Event Sequencing & Deduplication
- Every event has `sequenceId` field
- Client tracks `lastProcessedSequence` to prevent duplicates
- Out-of-order events are dropped

### ✅ Reconnection Handling
- Automatic room rejoin on reconnect
- State sync via `onStateSync` callback
- Auth token recovery (5-second retry window)
- Exponential backoff (1s → 30s)

### ✅ Error Handling
- Structured errors with codes and i18n keys
- User-friendly toast notifications
- Error logging with context

### ✅ Type Safety
- All events use TypeScript constants
- Typed payload interfaces
- Prevents typos and runtime errors

---

## Event Reference

### Connection Events
- `CONNECT` - Socket connected
- `DISCONNECT` - Socket disconnected
- `RECONNECT` - Reconnected after disconnect
- `CONNECT_ERROR` - Connection failed

### Lobby Events
- `JOIN_LOBBY` - Join lobby room
- `LEAVE_LOBBY` - Leave lobby room
- `LOBBY_UPDATE` - Lobby state changed
- `PLAYER_JOINED` - Player joined lobby
- `PLAYER_LEFT` - Player left lobby

### Game Events
- `GAME_STARTED` - Game started
- `GAME_UPDATE` - Game state changed
- `GAME_ACTION` - Player action
- `GAME_ABANDONED` - Game ended early

### Chat Events
- `SEND_CHAT_MESSAGE` - Send message (client → server)
- `CHAT_MESSAGE` - Receive message (server → client)
- `PLAYER_TYPING` - Typing indicator

### Error Events
- `ERROR` - Generic error
- `SERVER_ERROR` - Structured error with code

See `types/socket-events.ts` for complete list and payload types.

---

## Room Management

Use `SocketRooms` helper for consistent room names:

```typescript
// Lobby room
socket.join(SocketRooms.lobby(lobbyCode)) // "lobby:ABC123"

// Lobby list
socket.join(SocketRooms.lobbyList()) // "lobby-list"

// Future: Game room
socket.join(SocketRooms.game(gameId)) // "game:xyz"
```

---

## Common Issues & Solutions

### Issue: Duplicate events
**Solution**: Events have `sequenceId`, duplicates are automatically dropped

### Issue: State out of sync after reconnect
**Solution**: Implement `onStateSync` callback to refresh data

### Issue: Auth failures block reconnection
**Solution**: 5-second timeout allows retry after auth error

### Issue: Events arrive out of order
**Solution**: Sequence numbers ensure correct ordering

---

## Troubleshooting

### Client not receiving events
1. Check both servers running: `npm run dev:all`
2. Verify `CORS_ORIGIN` includes your domain
3. Check browser console for connection errors
4. Verify room joined: `socket.emit(SocketEvents.JOIN_LOBBY, code)`

### Server errors not showing
1. Check client has `SERVER_ERROR` handler
2. Verify error translations exist in `locales/`
3. Check server logs for error emission

### Reconnection not working
1. Verify `onStateSync` callback implemented
2. Check auth token not expired
3. Look for `authFailedRef` blocking reconnects

---

## Best Practices

1. **Always use typed events**: Import from `types/socket-events.ts`
2. **Implement state sync**: Add `onStateSync` callback
3. **Use room helpers**: `SocketRooms.lobby()` instead of string templates
4. **Handle errors**: Add error handlers for user feedback
5. **Log with context**: Include userId, lobbyCode, action type

---

## Migration from Old Code

**Before**:
```typescript
socket.on('game-update', (data) => {...})
socket.emit('join-lobby', code)
io.to(`lobby:${code}`).emit('player-joined', {...})
```

**After**:
```typescript
import { SocketEvents, SocketRooms } from '@/types/socket-events'

socket.on(SocketEvents.GAME_UPDATE, (data: GameUpdatePayload) => {...})
socket.emit(SocketEvents.JOIN_LOBBY, code)
emitWithMetadata(io, SocketRooms.lobby(code), SocketEvents.PLAYER_JOINED, {...})
```

---

## Performance

- Client memory: +~5KB (sequence tracking)
- Server memory: +~1KB (event counter)
- Network: +~50 bytes per event (metadata)
- Impact: **Negligible** ✅

---

## Future Enhancements

- [ ] Event replay (store in Redis for missed events)
- [ ] Correlation IDs (trace events across client/server)
- [ ] Optimistic updates with rollback
- [ ] Socket.IO Redis adapter (multi-server)
- [ ] Event metrics and monitoring

---

## Related Files

- `types/socket-events.ts` - Event definitions and types
- `socket-server.ts` - Socket.IO server
- `app/lobby/[code]/hooks/useSocketConnection.ts` - Client hook
- `locales/en.ts`, `locales/uk.ts` - Error translations

---

**Need help?** Check inline docs in `types/socket-events.ts` for detailed examples and flow diagrams.
