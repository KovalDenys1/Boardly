# Guest Mode Implementation Guide

## Overview

Guest mode allows users to join and play games without creating an account. This feature enables quick onboarding and reduces friction for new users.

## Features

- ✅ **No Authentication Required**: Users can start playing immediately
- ✅ **Temporary Identity**: Guest users are assigned a unique ID and name
- ✅ **Full Game Access**: Guests can create lobbies, join games, and play
- ✅ **Limited Features**: No stats, history, or saved progress
- ✅ **Auto Cleanup**: Inactive guest accounts are automatically deleted after 24 hours

## Architecture

### Backend (API)

Guest users are stored in the `Users` table with `isGuest = true`:

```typescript
// Guest user creation
const guestUser = await prisma.users.create({
  data: {
    id: guestId, // e.g., "guest-abc123"
    username: guestName,
    email: `guest-${guestId}@boardly.guest`,
    isGuest: true,
    lastActiveAt: new Date(),
  },
})
```

### Frontend (UI)

Guest state is managed via `GuestContext`:

```typescript
// In any component
import { useGuest } from '@/contexts/GuestContext'

function MyComponent() {
  const { isGuest, guestName, setGuestMode, clearGuestMode } = useGuest()
  
  // Set guest mode
  setGuestMode('PlayerName')
  
  // Clear guest mode
  clearGuestMode()
  
  return <div>{isGuest ? `Guest: ${guestName}` : 'Not a guest'}</div>
}
```

### API Requests

All API endpoints support guest authentication via headers:

```typescript
// Using fetch utility
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const response = await fetchWithGuest('/api/lobby', {
  method: 'POST',
  body: JSON.stringify({ gameType: 'yahtzee', name: 'My Lobby' }),
})

// Headers are automatically added:
// X-Guest-Id: guest-abc123
// X-Guest-Name: PlayerName
```

## Implementation Details

### 1. Database Schema

Guest users use the existing `Users` table with `isGuest` flag:

```prisma
model Users {
  id            String    @id @default(cuid())
  email         String?   @unique
  username      String?   @unique
  isGuest       Boolean   @default(false)
  lastActiveAt  DateTime  @default(now())
  // ... other fields
}
```

### 2. API Endpoints

All lobby and game endpoints support guest authentication:

- **POST /api/lobby**: Create lobby (guest or authenticated)
- **POST /api/lobby/[code]**: Join lobby (guest or authenticated)
- **POST /api/game/[gameId]/state**: Make move (guest or authenticated)

Authentication logic:

```typescript
// Check for authenticated user or guest
const session = await getServerSession(authOptions)
const guestId = request.headers.get('X-Guest-Id')
const guestName = request.headers.get('X-Guest-Name')

let userId: string
if (session?.user?.id) {
  userId = session.user.id
} else if (guestId && guestName) {
  const guestUser = await getOrCreateGuestUser(guestId, guestName)
  userId = guestUser.id
} else {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### 3. Guest Cleanup

Inactive guest users are automatically cleaned up:

```typescript
// lib/guest-helpers.ts
export async function cleanupOldGuests() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  
  const result = await prisma.users.deleteMany({
    where: {
      isGuest: true,
      lastActiveAt: { lt: twentyFourHoursAgo },
    },
  })
  
  return result.count
}
```

### 4. UI Components

**GuestModeButton**: Entry point for guest mode

```tsx
<GuestModeButton />
```

Features:

- Shows "Play as Guest" button when not authenticated
- Input for guest name (2-20 characters)
- Stores guest data in localStorage
- Shows current guest status with "Exit Guest Mode" option

**Header**: Displays guest indicator

```tsx
// Header shows guest name in yellow badge
{isGuest && guestName && (
  <div className="px-3 py-1 bg-yellow-400/20 rounded-full">
    <span className="text-yellow-100">👤 {guestName}</span>
  </div>
)}
```

## User Flow

### 1. Guest Entry

1. User visits homepage (not authenticated)
2. Clicks "Play as Guest" button
3. Enters name (2-20 characters)
4. Guest mode activated, stored in localStorage
5. User can now create/join lobbies

### 2. Guest Gaming

1. Create lobby: `fetchWithGuest('/api/lobby', { ... })`
2. Join lobby: `fetchWithGuest('/api/lobby/[code]', { ... })`
3. Play game: `fetchWithGuest('/api/game/[gameId]/state', { ... })`
4. All actions tracked with `guestId` + `guestName` headers

### 3. Guest Exit

- Click "Exit Guest Mode" in header/homepage
- Guest data cleared from localStorage
- User redirected to homepage

### 4. Auto Cleanup

- Guest accounts inactive for 24+ hours are deleted
- Triggered during lobby cleanup or periodic jobs
- No data loss for active guests

## Limitations

Guest users have the following restrictions:

- ❌ **No Profile**: Cannot access profile page
- ❌ **No Stats**: Game history not saved
- ❌ **No Friends**: Cannot add friends or send invites
- ❌ **No Achievements**: Progress not tracked
- ❌ **Temporary**: Account deleted after 24h inactivity

## Testing

### API Testing

```bash
# Create lobby as guest
curl -X POST http://localhost:3000/api/lobby \
  -H 'Content-Type: application/json' \
  -H 'X-Guest-Id: guest-test-123' \
  -H 'X-Guest-Name: TestGuest' \
  -d '{"gameType":"yahtzee","name":"Test Lobby","maxPlayers":4}'

# Join lobby as guest
curl -X POST http://localhost:3000/api/lobby/A16I \
  -H 'Content-Type: application/json' \
  -H 'X-Guest-Id: guest-test-456' \
  -H 'X-Guest-Name: AnotherGuest' \
  -d '{}'
```

### UI Testing

1. Open `http://localhost:3000`
2. Click "Play as Guest"
3. Enter name and continue
4. Navigate to game lobbies
5. Create or join a lobby
6. Verify guest indicator in header
7. Play game to test full flow

## Migration Notes

For existing projects:

1. ✅ Schema already has `isGuest` field
2. ✅ No database migration required
3. ✅ Backward compatible with authenticated users
4. ✅ All tests passing (131/131)

## Security Considerations

- Guest IDs are client-generated UUIDs (no server validation)
- Guest names are client-provided (validated for length only)
- Guests cannot access protected routes (profile, friends)
- Guest data auto-deleted after 24h inactivity
- No sensitive operations allowed for guests
- Rate limiting applies to all users (guests included)

## Future Enhancements

- [ ] Convert guest to full account (upgrade flow)
- [ ] Guest progress migration on account creation
- [ ] Guest lobby history (session-based)
- [ ] Guest game replays (temporary storage)
- [ ] Guest spectator mode (view without playing)

## Files Changed

### New Files

- `contexts/GuestContext.tsx` - Guest state management
- `components/GuestModeButton.tsx` - Guest mode UI
- `lib/guest-helpers.ts` - Guest user utilities
- `lib/fetch-with-guest.ts` - Fetch wrapper with guest headers
- `docs/GUEST_MODE.md` - This documentation

### Modified Files

- `app/providers.tsx` - Added GuestProvider
- `app/api/lobby/route.ts` - Guest authentication support
- `app/api/lobby/[code]/route.ts` - Guest join support
- `components/Header.tsx` - Guest indicator
- `components/HomePage/HeroSection.tsx` - Guest mode button
- `locales/en.ts` - Guest mode translations (English)
- `locales/uk.ts` - Guest mode translations (Ukrainian)
- `__tests__/api/lobby-code.test.ts` - Updated mocks

## Troubleshooting

### Guest cannot create lobby

- Check console for 401 errors
- Verify localStorage has `boardly_guest_id` and `boardly_guest_name`
- Ensure API request includes `X-Guest-Id` and `X-Guest-Name` headers

### Guest account not found

- Guest may have been auto-cleaned (24h inactivity)
- Clear localStorage and create new guest identity
- Check database for `isGuest = true` entries

### Guest mode not persisting

- Check localStorage permissions
- Verify `GuestProvider` is wrapping app in `app/providers.tsx`
- Ensure `useGuest()` hook is called within `GuestProvider`

## Contact

For questions or issues related to guest mode:

- Check docs: `docs/GUEST_MODE.md`
- Review code: `lib/guest-helpers.ts`, `contexts/GuestContext.tsx`
- Run tests: `npm test`
