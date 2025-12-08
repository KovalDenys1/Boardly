# Email Verification & Account Cleanup System

## Overview
Boardly implements email verification for email/password accounts to ensure valid users and prevent spam registrations.

## Email Verification Flow

### 1. Registration
When a user registers with email/password:
1. Account is created with `emailVerified: null`
2. Verification email is automatically sent with a unique token
3. Token is valid for 24 hours
4. User can login but will see verification warnings

### 2. Verification
User clicks the verification link in email:
- Link format: `https://boardly.online/auth/verify-email?token=<token>`
- API validates token and marks email as verified
- Token is deleted after successful verification
- Expired tokens are automatically rejected

### 3. Resending Verification
Users can resend verification email:
- From profile page (if logged in)
- From login page (if not logged in)
- Rate limited to prevent abuse
- Old tokens are deleted when new one is generated

## Account Cleanup System

### Why Cleanup?
- Prevent database bloat from abandoned registrations
- Reduce spam and fake accounts
- Ensure only active users remain in the system

### Cleanup Rules

**Accounts Affected:**
- ✅ Email/password accounts with `emailVerified: null`
- ✅ Created more than 7 days ago
- ❌ NOT bot accounts (`isBot: false`)
- ❌ NOT OAuth accounts (Google, GitHub - they don't need email verification)

**Timeline:**
- Day 1-5: Account active, user can verify at any time
- Day 5: Warning email sent (2 days before deletion)
- Day 7: Account automatically deleted if still unverified

### Manual Cleanup

Run cleanup script manually:
```bash
npx tsx scripts/cleanup-unverified.ts
```

This will:
1. Show current unverified account statistics
2. List accounts needing warnings
3. List accounts to be deleted
4. Wait 5 seconds for confirmation
5. Delete accounts older than 7 days

### Automated Cleanup (Cron Job)

**API Endpoint:** `GET/POST /api/cron/cleanup-unverified`

**Authentication:** Requires `Authorization: Bearer <CRON_SECRET>` header

**Schedule:** Recommended to run daily

**Vercel Cron Configuration** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-unverified",
      "schedule": "0 2 * * *"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "warned": 3,
  "deleted": 5,
  "warnedUsers": [
    {
      "email": "user@example.com",
      "username": "user123",
      "createdAt": "2025-12-03T10:00:00Z",
      "daysUntilDeletion": 2
    }
  ],
  "deletedUsers": [
    {
      "email": "old@example.com",
      "username": "olduser",
      "createdAt": "2025-11-28T10:00:00Z"
    }
  ],
  "timestamp": "2025-12-08T02:00:00Z"
}
```

## User Experience

### Profile Page Verification Banner
Unverified users see a prominent warning banner:
- ⚠️ Yellow banner at top of profile
- Clear message about verification requirement
- Button to resend verification email
- Warning about 7-day deletion policy

### Login Page
- Users can login even if unverified
- Redirect to profile page shows verification banner
- Can request new verification email from login page

### API Protection
Some features may require verified email:
- Creating lobbies (optional, can be enforced)
- Sending friend requests (optional)
- Participating in tournaments (future)

## Environment Variables

```bash
# Required for email verification
RESEND_API_KEY=your_resend_api_key

# Required for cron job authentication
CRON_SECRET=your_secret_key  # Falls back to JWT_SECRET if not set
```

## Code References

### API Endpoints
- `POST /api/auth/verify-email` - Verify email with token
- `POST /api/auth/resend-verification` - Resend verification email
- `GET/POST /api/cron/cleanup-unverified` - Automated cleanup (cron)

### Libraries
- `lib/cleanup-unverified.ts` - Cleanup logic
  - `cleanupUnverifiedAccounts(daysOld)` - Delete old unverified accounts
  - `warnUnverifiedAccounts(daysBeforeDeletion, totalDays)` - Send warnings

### Scripts
- `scripts/cleanup-unverified.ts` - Manual cleanup with confirmation

### Components
- Profile page shows verification banner
- Resend verification button in profile

## Database Schema

### EmailVerificationToken
```prisma
model EmailVerificationToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expires   DateTime
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([token])
}
```

### User
```prisma
model User {
  emailVerified DateTime?  // null = unverified, Date = verified
  // ... other fields
}
```

## Testing Cleanup

### Create Test Unverified Account
```typescript
// In Prisma Studio or script
await prisma.user.create({
  data: {
    email: 'test@example.com',
    username: 'testuser',
    passwordHash: await bcrypt.hash('password', 10),
    emailVerified: null,
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
  }
})
```

### Test Cleanup
```bash
npx tsx scripts/cleanup-unverified.ts
```

### Test Cron Endpoint
```bash
curl -X POST http://localhost:3000/api/cron/cleanup-unverified \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Monitoring

### Logs
All cleanup operations are logged:
- Info: Cleanup started, completed, accounts processed
- Error: Any failures during cleanup
- Context: Number of accounts warned/deleted

### Metrics to Track
- Number of unverified accounts over time
- Verification rate (verified / total registered)
- Cleanup effectiveness (accounts deleted per run)
- Time between registration and verification

## Future Enhancements

- [ ] Send warning emails 2 days before deletion
- [ ] Dashboard showing unverified account statistics
- [ ] Allow admin to manually verify/delete accounts
- [ ] Configurable cleanup period (currently hardcoded to 7 days)
- [ ] Email templates for warnings and verification
- [ ] Track verification attempts per user
- [ ] Grace period for users who clicked resend recently

## Security Considerations

1. **Token Security**
   - Tokens are cryptographically random (32 bytes)
   - Tokens expire after 24 hours
   - One-time use (deleted after verification)

2. **Rate Limiting**
   - Resend verification uses `rateLimitPresets.auth`
   - Prevents spam and abuse

3. **Cron Authentication**
   - Requires secret bearer token
   - Logs unauthorized attempts with IP

4. **OAuth Exclusion**
   - OAuth users are never deleted
   - Email is verified by OAuth provider

5. **Bot Protection**
   - Bot accounts are never deleted
   - Bots don't need email verification
