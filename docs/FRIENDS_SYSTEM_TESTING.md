# Friends System Testing Guide

## Testing Checklist

### 1. Friend Code System ✅

**Test: Generate Friend Code**
```
1. Login to your account
2. Go to Profile
3. Navigate to Friends tab
4. Your friend code should display at the top (5-digit number)
5. Test: Copy friend code button should copy to clipboard
6. Test: Copy profile link button should copy shareable link
```

**Expected**: Friend code is 5 digits (e.g., 38395)

---

### 2. Add Friend by Code ✅

**Test: Send Friend Request by Code**
```
1. User A: Note down your friend code (e.g., 12345)
2. User B: Go to Friends tab
3. User B: Click "Add Friend" button
4. User B: Toggle to "Friend Code" mode
5. User B: Enter User A's friend code (12345)
6. User B: (Optional) Add message
7. User B: Click "Send Request"
```

**Expected Results**:
- ✅ Success message: "Friend request sent"
- ✅ Request appears in User B's "Sent Requests" tab
- ✅ Request appears in User A's "Friend Requests" tab

**Possible Errors**:
- "User not found with this friend code" - Code doesn't exist
- "Invalid friend code format" - Not 5 digits
- "You cannot add yourself" - Trying to add own code
- "Already friends" - Already friends with this user
- "Friend request already exists" - Pending request exists

---

### 3. Add Friend by Username ✅

**Test: Send Friend Request by Username**
```
1. User A: Note your username
2. User B: Go to Friends tab
3. User B: Click "Add Friend" button
4. User B: Keep "Username" mode selected
5. User B: Enter User A's username
6. User B: (Optional) Add message
7. User B: Click "Send Request"
```

**Expected Results**:
- ✅ Success message: "Friend request sent"
- ✅ Request appears in User B's "Sent Requests" tab
- ✅ Request appears in User A's "Friend Requests" tab

**Possible Errors**:
- "User not found" - Username doesn't exist
- "Cannot send friend request to yourself" - Trying to add yourself
- "Already friends" - Already friends
- "Friend request already exists" - Pending request exists

---

### 4. Accept Friend Request ✅

**Test: Accept Incoming Request**
```
1. User A: Has pending request from User B
2. User A: Go to Friends tab
3. User A: Navigate to "Requests" tab
4. User A: Find User B's request
5. User A: Click green "✓ Accept" button
```

**Expected Results**:
- ✅ Success message: "Friend request accepted"
- ✅ Request disappears from "Requests" tab
- ✅ User B appears in "Friends" list
- ✅ User A appears in User B's "Friends" list
- ✅ Both users see online status indicator

---

### 5. Reject Friend Request ✅

**Test: Reject Incoming Request**
```
1. User A: Has pending request from User B
2. User A: Go to Friends tab
3. User A: Navigate to "Requests" tab
4. User A: Find User B's request
5. User A: Click red "✗ Reject" button
```

**Expected Results**:
- ✅ Success message: "Friend request rejected"
- ✅ Request disappears from "Requests" tab
- ✅ Request marked as "rejected" in database
- ✅ User B can send new request later

---

### 6. Cancel Sent Request ❓ (TO VERIFY)

**Test: Cancel Outgoing Request**
```
1. User A: Has sent request to User B (pending)
2. User A: Go to Friends tab
3. User A: Navigate to "Sent" tab
4. User A: Find request to User B
5. User A: Click "Cancel" button (if available)
```

**Expected**: Request cancelled and removed from both users' views

**Note**: Need to verify if cancel functionality exists

---

### 7. Remove Friend ✅

**Test: Remove Existing Friend**
```
1. User A: Is friends with User B
2. User A: Go to Friends tab
3. User A: Find User B in friends list
4. User A: Hover over User B's card
5. User A: Click red "Remove" button that appears
6. User A: Confirm removal
```

**Expected Results**:
- ✅ Friend removed from User A's list
- ✅ User A removed from User B's list
- ✅ Friendship record deleted from database
- ✅ Both users can send new friend requests

---

### 8. Online Status ✅

**Test: Real-time Online Indicator**
```
1. User A: Login
2. User B: Login (friends with User A)
3. User B: Navigate to Friends tab
4. Check User A's card for green bar at top
```

**Expected**:
- ✅ Online users show green bar
- ✅ Offline users show gray bar
- ✅ Status updates in real-time via WebSocket

**Technical**:
- WebSocket connection to Socket.IO server
- Events: `online-users`, `user-online`, `user-offline`
- Reconnection on disconnect

---

### 9. Friend Statistics ✅

**Test: Display Friend Stats**
```
1. Have friends with game history
2. Check friend cards in Friends list
3. Verify stats display:
   - Total games played
   - Total wins
   - Win rate percentage
```

**Expected**: Stats displayed as badges on friend cards

---

### 10. Duplicate Prevention ✅

**Test: Cannot Send Duplicate Requests**
```
1. User A: Send request to User B
2. User A: Try to send request to User B again
```

**Expected**: Error - "Friend request already exists"

**Test: Cannot Add Already Friends**
```
1. User A: Already friends with User B
2. User A: Try to send request to User B
```

**Expected**: Error - "Already friends"

---

## Common Issues & Solutions

### Issue: "Friend request not received"

**Possible Causes**:
1. ❌ Friend code doesn't exist in database
2. ❌ Username typo
3. ❌ Browser console shows API error
4. ❌ Page not refreshed after sending

**Debug Steps**:
```
1. Check browser console (F12) for errors
2. Verify friend code/username is correct
3. Check Network tab - see if API call succeeded (200 OK)
4. Manually refresh Friends tab
5. Check database for FriendRequest record
```

---

### Issue: "Request sent but not showing in Sent tab"

**Cause**: Frontend not reloading data after API success

**Fixed**: Component now calls `loadRequests()` after successful send

**Verify**:
```typescript
// In handleSendRequestByCode and handleSendRequest:
await loadRequests() // Should be called after success
```

---

### Issue: "Online status not updating"

**Possible Causes**:
1. WebSocket connection failed
2. Socket.IO server not running
3. CORS issues

**Debug**:
```
1. Check browser console for Socket messages
2. Look for: "✅ Connected to socket for online status"
3. Verify Socket.IO server running on port 3001
4. Check CORS_ORIGIN includes your domain
```

---

## API Endpoints Reference

### Friend Requests
- `POST /api/friends/request` - Send request by username
- `POST /api/friends/add-by-code` - Send request by friend code
- `GET /api/friends/request?type=received` - Get received requests
- `GET /api/friends/request?type=sent` - Get sent requests
- `POST /api/friends/request/[id]/accept` - Accept request
- `POST /api/friends/request/[id]/reject` - Reject request

### Friends List
- `GET /api/friends` - Get all friends
- `DELETE /api/friends/[friendshipId]` - Remove friend

### Friend Code
- `GET /api/user/friend-code` - Get/generate friend code

---

## Database Verification

### Check Friend Request Created
```sql
SELECT * FROM "FriendRequest" 
WHERE "senderId" = 'user-a-id' 
AND "receiverId" = 'user-b-id' 
AND "status" = 'pending';
```

### Check Friendship Created
```sql
SELECT * FROM "Friendship" 
WHERE ("user1Id" = 'user-a-id' AND "user2Id" = 'user-b-id')
OR ("user1Id" = 'user-b-id' AND "user2Id" = 'user-a-id');
```

### Check User Has Friend Code
```sql
SELECT "id", "username", "friendCode" 
FROM "User" 
WHERE "friendCode" = '38395';
```

---

## Testing with Code 38395

**If request to code 38395 didn't work**:

1. **Verify user exists**:
```bash
# In project root
npm run db:studio
# Check Users table for friendCode = "38395"
```

2. **Check logs**:
```bash
# Browser console (F12)
# Look for errors in Network tab
# Check POST /api/friends/add-by-code response
```

3. **Manual test**:
```bash
# Use curl to test API directly
curl -X POST http://localhost:3000/api/friends/add-by-code \
  -H "Content-Type: application/json" \
  -d '{"friendCode":"38395","message":"Test"}'
```

---

## Recent Fixes

### Fix #1: loadRequests() API Mismatch ✅
**Problem**: Frontend called `/api/friends/request` expecting both received and sent, but API returned only one type

**Solution**: Now makes two parallel requests:
```typescript
const [receivedRes, sentRes] = await Promise.all([
  fetch('/api/friends/request?type=received'),
  fetch('/api/friends/request?type=sent')
])
```

**Status**: ✅ Fixed and tested

---

## Contact

If issues persist after following this guide:
1. Check browser console for errors
2. Check server logs for API errors
3. Verify database records manually
4. Check Socket.IO connection status

**Last Updated**: December 9, 2025  
**System Status**: ✅ All core features working
