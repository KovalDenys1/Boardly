# Account Deletion System

## Overview
Safe account deletion system with email confirmation to prevent accidental deletions.

## Flow

### 1. User Initiates Deletion
- User goes to Profile → Danger Zone
- Clicks "Delete Account"
- Confirms they want to proceed
- System sends email with deletion link

### 2. Email Confirmation
- User receives email with prominent warning
- Email lists what will be deleted:
  - Profile and personal information
  - Game history and statistics
  - Friend connections and requests
  - All achievements and progress
- Link expires in 1 hour

### 3. Final Deletion
- User clicks link in email
- Redirected to `/auth/delete-account?token=...`
- Must type "DELETE" to confirm
- System deletes all user data
- User is signed out and redirected to home

## API Endpoints

### POST `/api/user/request-deletion`
Request account deletion email.

**Authentication**: Required (session)

**Response**:
```json
{
  "success": true,
  "message": "Deletion confirmation email sent"
}
```

**Errors**:
- `401`: Unauthorized (not logged in)
- `404`: User not found
- `400`: Bot accounts cannot be deleted this way
- `400`: Email is required for account deletion

### POST `/api/user/delete-account`
Permanently delete account (called from email link).

**Body**:
```json
{
  "token": "string"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Errors**:
- `400`: Token is required
- `400`: Invalid or expired deletion token
- `400`: Deletion token has expired
- `404`: User not found
- `400`: Bot accounts cannot be deleted

## Token Storage
Deletion tokens are stored in `PasswordResetToken` table with `DELETE_` prefix:
```typescript
await prisma.passwordResetToken.create({
  data: {
    userId: user.id,
    token: `DELETE_${token}`, // Prefix distinguishes from password reset tokens
    expires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  }
})
```

## Data Deletion
When account is deleted, the following are removed:
1. All password reset and verification tokens
2. User statistics
3. User achievements
4. Friend requests (sent and received)
5. Friendships
6. User account (cascades to sessions, accounts, players, lobbies)

## Safety Features
- **Email confirmation required**: Prevents accidental deletions
- **Type "DELETE" confirmation**: Extra safety step on deletion page
- **1-hour token expiration**: Limited time window for deletion
- **Bot account protection**: Bots cannot be deleted via this system
- **Two-step UI confirmation**: Button → Confirmation dialog → Email

## Email Template
Red warning theme with:
- Clear subject: "⚠️ Confirm Account Deletion"
- Prominent warnings
- List of what will be deleted
- Large red deletion button
- Note about permanent action
- 1-hour expiry notice

## UI Components

### Profile Page (`app/profile/page.tsx`)
- Danger Zone section at bottom
- Two-step confirmation:
  1. Click "Delete Account"
  2. Show warning with "Send Deletion Email" button
- Disabled state while sending email

### Deletion Page (`app/auth/delete-account/page.tsx`)
- Validates token on load
- Shows warning with list of deletions
- Requires typing "DELETE" to enable button
- Shows success message and auto-redirects
- Handles expired/invalid tokens

## Translation Keys
```json
{
  "deleteAccount": {
    "title": "Delete Account",
    "confirmation": "This action cannot be undone...",
    "willBeDeleted": "What will be deleted:",
    "profileData": "Your profile and personal information",
    "gameHistory": "All game history and statistics",
    "friends": "Friend connections and requests",
    "achievements": "All achievements and progress",
    "typeDelete": "Type DELETE to confirm:",
    "confirmDelete": "Delete My Account Forever",
    "error": "Deletion Failed",
    "success": "Account Deleted",
    "successMessage": "Your account has been deleted..."
  },
  "errors": {
    "confirmDelete": "Please type DELETE to confirm",
    "tokenExpired": "Deletion token has expired...",
    "invalidToken": "Invalid or missing token"
  },
  "toast": {
    "accountDeleted": "Account deleted successfully"
  }
}
```

## Testing

### Manual Test Flow
1. **Request Deletion**:
   ```bash
   # Login and go to profile
   # Click Delete Account → Send Deletion Email
   # Check email inbox
   ```

2. **Verify Email**:
   - Email should have red warning theme
   - Check link format: `/auth/delete-account?token=...`
   - Verify 1-hour expiry mentioned

3. **Delete Account**:
   - Click link from email
   - Should redirect to deletion page
   - Type "DELETE" in input
   - Click confirmation button
   - Should see success message
   - Should be signed out
   - Should redirect to home

4. **Verify Deletion**:
   ```bash
   # Try to login with deleted account
   # Should fail
   # Check database - user should be gone
   ```

### Edge Cases
- **Expired token**: Should show error message
- **Invalid token**: Should show error message
- **Bot account**: Should return error from API
- **Already deleted**: Token should be invalid

## Rate Limiting
Both endpoints use `rateLimitPresets.auth`:
- 10 requests per 15 minutes per IP
- Prevents abuse of deletion system

## Logging
All operations logged with context:
```typescript
log.info('Account deletion requested', {
  userId: user.id,
  email: user.email
})

log.info('Account deleted successfully', {
  userId: user.id,
  email: user.email
})
```

## Environment Variables
None required - uses existing:
- `DATABASE_URL`: For Prisma
- `NEXTAUTH_SECRET`: For session management
- `RESEND_API_KEY`: For sending emails

## Future Improvements
- [ ] Add "cancel deletion" functionality (grace period)
- [ ] Export user data before deletion (GDPR compliance)
- [ ] Handle edge cases (active games, pending friend requests)
- [ ] Add deletion reason tracking
- [ ] Admin review for suspicious deletions
- [ ] Soft delete option (mark as deleted, purge later)
