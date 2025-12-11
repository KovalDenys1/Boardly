# Friend System API Documentation

## Overview
Complete friend management system with friend requests, accept/reject functionality, and friends list.

## Database Schema

### FriendRequest Model
Tracks pending, accepted, and rejected friend requests.

```typescript
{
  id: string
  senderId: string
  receiverId: string
  status: "pending" | "accepted" | "rejected" | "cancelled"
  message?: string  // Optional message with request
  createdAt: DateTime
  updatedAt: DateTime
}
```

### Friendship Model
Represents accepted friend relationships.

```typescript
{
  id: string
  user1Id: string  // Always < user2Id
  user2Id: string
  createdAt: DateTime
}
```

**Important**: `user1Id` is always less than `user2Id` to prevent duplicate friendships in the database.

## API Endpoints

### 1. Get Friends List
**Endpoint**: `GET /api/friends`  
**Auth**: Required (NextAuth session)

**Response**:
```json
{
  "friends": [
    {
      "id": "user123",
      "username": "john_doe",
      "avatar": "avatar-1",
      "email": "john@example.com",
      "statistics": {
        "totalGames": 42,
        "totalWins": 18,
        "winRate": 0.43
      },
      "friendshipId": "friendship789",
      "friendsSince": "2025-12-08T10:00:00Z"
    }
  ]
}
```

**Usage**:
```typescript
const response = await fetch('/api/friends', {
  headers: {
    'Content-Type': 'application/json'
  }
})
const { friends } = await response.json()
```

---

### 2. Send Friend Request
**Endpoint**: `POST /api/friends/request`  
**Auth**: Required

**Body**:
```json
{
  "receiverUsername": "john_doe",
  "message": "Hey! Let's play some games together!" // Optional
}
```

**Response**:
```json
{
  "success": true,
  "friendRequest": {
    "id": "req123",
    "senderId": "user456",
    "receiverId": "user789",
    "status": "pending",
    "message": "Hey! Let's play some games together!",
    "createdAt": "2025-12-08T10:00:00Z",
    "sender": {
      "id": "user456",
      "username": "jane_doe",
      "avatar": "avatar-2",
      "email": "jane@example.com"
    },
    "receiver": {
      "id": "user789",
      "username": "john_doe",
      "avatar": "avatar-1",
      "email": "john@example.com"
    }
  }
}
```

**Validations**:
- ❌ Cannot send request to yourself
- ❌ Cannot send request to bots
- ❌ Cannot send duplicate requests
- ❌ Cannot send request if already friends

**Usage**:
```typescript
const response = await fetch('/api/friends/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    receiverUsername: 'john_doe',
    message: 'Hey! Let\'s play together!'
  })
})
const { success, friendRequest } = await response.json()
```

---

### 3. Get Friend Requests
**Endpoint**: `GET /api/friends/request?type=[received|sent|all]`  
**Auth**: Required  
**Query Params**: 
- `type` (optional): "received" (default), "sent", or "all"

**Response**:
```json
{
  "requests": [
    {
      "id": "req123",
      "senderId": "user456",
      "receiverId": "user789",
      "status": "pending",
      "message": "Hey! Let's play!",
      "createdAt": "2025-12-08T10:00:00Z",
      "updatedAt": "2025-12-08T10:00:00Z",
      "sender": {
        "id": "user456",
        "username": "jane_doe",
        "avatar": "avatar-2",
        "email": "jane@example.com"
      },
      "receiver": {
        "id": "user789",
        "username": "john_doe",
        "avatar": "avatar-1",
        "email": "john@example.com"
      }
    }
  ]
}
```

**Usage**:
```typescript
// Get received requests (default)
const response = await fetch('/api/friends/request')

// Get sent requests
const response = await fetch('/api/friends/request?type=sent')

// Get all requests
const response = await fetch('/api/friends/request?type=all')

const { requests } = await response.json()
```

---

### 4. Accept Friend Request
**Endpoint**: `POST /api/friends/request/[requestId]/accept`  
**Auth**: Required (must be the receiver)

**Response**:
```json
{
  "success": true,
  "friendship": {
    "id": "friendship123",
    "user1Id": "user456",
    "user2Id": "user789",
    "createdAt": "2025-12-08T10:05:00Z",
    "user1": {
      "id": "user456",
      "username": "jane_doe",
      "avatar": "avatar-2"
    },
    "user2": {
      "id": "user789",
      "username": "john_doe",
      "avatar": "avatar-1"
    }
  }
}
```

**Validations**:
- ❌ Only the receiver can accept
- ❌ Request must be in "pending" status
- ✅ Creates Friendship record
- ✅ Updates FriendRequest status to "accepted"

**Usage**:
```typescript
const response = await fetch(`/api/friends/request/${requestId}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
const { success, friendship } = await response.json()
```

---

### 5. Reject Friend Request
**Endpoint**: `POST /api/friends/request/[requestId]/reject`  
**Auth**: Required (must be the receiver)

**Response**:
```json
{
  "success": true,
  "message": "Friend request rejected"
}
```

**Validations**:
- ❌ Only the receiver can reject
- ❌ Request must be in "pending" status
- ✅ Updates FriendRequest status to "rejected"
- ❌ Does NOT create Friendship

**Usage**:
```typescript
const response = await fetch(`/api/friends/request/${requestId}/reject`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
const { success, message } = await response.json()
```

---

### 6. Remove Friend
**Endpoint**: `DELETE /api/friends/[friendshipId]`  
**Auth**: Required (must be part of the friendship)

**Response**:
```json
{
  "success": true,
  "message": "Friend removed"
}
```

**Validations**:
- ❌ Only users in the friendship can remove it
- ✅ Deletes Friendship record
- ✅ Both users can remove the friendship

**Usage**:
```typescript
const response = await fetch(`/api/friends/${friendshipId}`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' }
})
const { success, message } = await response.json()
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message description"
}
```

**Common Error Status Codes**:
- `400` - Bad Request (validation error, duplicate request, etc.)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (not authorized for this action)
- `404` - Not Found (user/request/friendship not found)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## Rate Limiting

All endpoints use `rateLimitPresets.api`:
- **Limit**: 100 requests per 15 minutes per IP
- Applied using `rateLimit()` middleware

---

## Frontend Integration Example

### React Hook for Friend Management

```typescript
// hooks/useFriends.ts
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface Friend {
  id: string
  username: string
  avatar: string
  email: string
  statistics: {
    totalGames: number
    totalWins: number
    winRate: number
  }
  friendshipId: string
  friendsSince: string
}

export function useFriends() {
  const { data: session } = useSession()
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      loadFriends()
    }
  }, [session])

  const loadFriends = async () => {
    try {
      const response = await fetch('/api/friends')
      const data = await response.json()
      setFriends(data.friends || [])
    } catch (error) {
      console.error('Failed to load friends:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendFriendRequest = async (username: string, message?: string) => {
    const response = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverUsername: username, message })
    })
    return response.json()
  }

  const acceptRequest = async (requestId: string) => {
    const response = await fetch(`/api/friends/request/${requestId}/accept`, {
      method: 'POST'
    })
    await loadFriends() // Reload friends list
    return response.json()
  }

  const rejectRequest = async (requestId: string) => {
    const response = await fetch(`/api/friends/request/${requestId}/reject`, {
      method: 'POST'
    })
    return response.json()
  }

  const removeFriend = async (friendshipId: string) => {
    const response = await fetch(`/api/friends/${friendshipId}`, {
      method: 'DELETE'
    })
    await loadFriends() // Reload friends list
    return response.json()
  }

  return {
    friends,
    loading,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    reload: loadFriends
  }
}
```

---

## Security Considerations

1. **Authentication**: All endpoints require NextAuth session
2. **Authorization**: Users can only:
   - Accept/reject requests sent to them
   - Remove friendships they're part of
3. **Rate Limiting**: Prevents abuse with API rate limits
4. **Validation**: Prevents self-requests, bot requests, and duplicates
5. **Cascade Deletion**: Friendships and requests auto-delete when users are deleted

---

## Database Indexes

Optimized for performance:
- `FriendRequest`: Indexed on `senderId`, `receiverId`, `status`, `createdAt`
- `Friendship`: Indexed on `user1Id`, `user2Id`, `createdAt`
- Unique constraints prevent duplicates

---

## Future Enhancements

- [ ] Friend notifications (real-time via Socket.IO)
- [ ] Friend search/suggestions
- [ ] Mutual friends display
- [ ] Block user functionality
- [ ] Friend activity feed
- [ ] Direct messaging between friends
