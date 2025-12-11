# Account Linking with Prisma Adapter

## Overview
Prisma Adapter automatically handles linking multiple OAuth providers to a single user account based on email address matching.

## How It Works

### Architecture
```
NextAuth + PrismaAdapter
    ↓
User Table (one user)
    ↓
Account Table (multiple providers)
    ├─ Google Account
    ├─ GitHub Account
    └─ Discord Account
```

### Database Schema
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  username      String?
  accounts      Account[] // Multiple OAuth providers
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String  // "google", "github", "discord"
  providerAccountId String
  // ... OAuth tokens
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

## Account Linking Flow

### Scenario 1: New User via OAuth
```
1. User clicks "Sign in with Google"
   ↓
2. Google authorizes, returns email: user@example.com
   ↓
3. PrismaAdapter checks: Does user@example.com exist?
   ↓
4. NO → PrismaAdapter creates:
   - New User record (email: user@example.com)
   - New Account record (provider: google, userId: user.id)
   ↓
5. createUser event fires → Auto-verify email
   ↓
6. User is signed in
```

### Scenario 2: Existing User Links Another Provider
```
1. User already exists (email: user@example.com)
   - Has Account: provider=google
   ↓
2. User goes to Profile → Connect GitHub
   ↓
3. GitHub authorizes, returns email: user@example.com
   ↓
4. PrismaAdapter checks: Does user@example.com exist?
   ↓
5. YES → PrismaAdapter creates:
   - New Account record (provider: github, userId: SAME_USER_ID)
   ↓
6. linkAccount event fires → Log the linking
   ↓
7. Now user can sign in with either Google or GitHub
```

### Scenario 3: Email/Password User Adds OAuth
```
1. User created account via email/password
   - email: user@example.com
   - passwordHash: "..."
   - emailVerified: null (not verified yet)
   ↓
2. User links Google account
   ↓
3. PrismaAdapter creates:
   - New Account record (provider: google, userId: user.id)
   ↓
4. Next time user signs in with Google:
   - signIn callback checks emailVerified
   - If null → Updates to new Date()
   ↓
5. User now has:
   - Email/password login (verified ✅)
   - Google OAuth login
```

## Important: Email Matching

### PrismaAdapter Behavior
- **Matches by email**: If OAuth email matches existing user email → Links to same account
- **Creates new user**: If OAuth email doesn't match → Creates separate user
- **Case sensitive**: Emails are case-sensitive in database

### Example
```typescript
// User 1: john@example.com (created via Google)
// User tries to link GitHub with john@example.com
// ✅ Same account - Account record added

// User 1: john@example.com (created via Google)
// User tries to link GitHub with john.doe@different.com
// ❌ Different email - Would create new user
```

## NextAuth Configuration

### With Prisma Adapter
```typescript
import { PrismaAdapter } from '@next-auth/prisma-adapter'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma), // ✅ Must be added
  
  providers: [
    GoogleProvider({ ... }),
    GitHubProvider({ ... }),
    DiscordProvider({ ... }),
  ],
  
  callbacks: {
    async signIn({ user, account }) {
      // Auto-verify OAuth users
      if (account?.provider !== 'credentials') {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! }
        })
        
        if (existingUser && !existingUser.emailVerified) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { emailVerified: new Date() }
          })
        }
      }
      return true
    }
  },
  
  events: {
    async createUser({ user }) {
      // Set username and verify email for new OAuth users
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, accounts: true }
      })
      
      if (dbUser && !dbUser.passwordHash && dbUser.accounts.length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { 
            emailVerified: new Date(),
            username: user.email?.split('@')[0]
          }
        })
      }
    },
    
    async linkAccount({ user, account }) {
      // Log account linking for monitoring
      console.log(`Account linked: ${account.provider} for user ${user.id}`)
    }
  }
}
```

## UI Implementation

### Profile Page - Connected Accounts
```tsx
const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccounts>({})

// Fetch linked accounts
useEffect(() => {
  const fetchLinkedAccounts = async () => {
    const res = await fetch('/api/user/linked-accounts')
    const data = await res.json()
    setLinkedAccounts(data.linkedAccounts || {})
  }
  fetchLinkedAccounts()
}, [])

// Render
{linkedAccounts.google ? (
  <button onClick={() => handleUnlinkAccount('google')}>
    Unlink
  </button>
) : (
  <button onClick={() => window.location.href = '/api/auth/signin/google'}>
    Connect
  </button>
)}
```

### API Endpoint
```typescript
// GET /api/user/linked-accounts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      accounts: {
        select: {
          provider: true,
          providerAccountId: true,
          id: true
        }
      }
    }
  })
  
  const linkedAccounts = {
    google: user.accounts.find(a => a.provider === 'google'),
    github: user.accounts.find(a => a.provider === 'github'),
    discord: user.accounts.find(a => a.provider === 'discord')
  }
  
  return NextResponse.json({ linkedAccounts })
}
```

## Security Considerations

### Preventing Account Takeover
1. **Email verification**: OAuth providers verify emails
2. **Email matching**: Only same email can link accounts
3. **Account ownership**: Cannot link someone else's OAuth account

### Unlinking Safety
```typescript
// Cannot unlink if it's the only auth method
if (!user.passwordHash && user.accounts.length === 1) {
  return error('Cannot unlink the only authentication method')
}
```

## Common Issues

### Issue: User can't link OAuth account
**Cause**: Different email address in OAuth provider
**Solution**: Ensure same email is used across all providers

### Issue: Multiple users with same email
**Cause**: PrismaAdapter not used, manual user creation
**Solution**: Use PrismaAdapter - it handles email uniqueness

### Issue: Account not showing as linked
**Cause**: Frontend not fetching accounts correctly
**Solution**: Check API returns accounts from database

## Testing

### Test Account Linking
```bash
# 1. Create user via Google
# 2. Check database
SELECT u.email, a.provider 
FROM "User" u
JOIN "Account" a ON u.id = a.userId
WHERE u.email = 'test@example.com';

# Should show:
# test@example.com | google

# 3. Link GitHub
# 4. Check database again
# Should show:
# test@example.com | google
# test@example.com | github
```

### Test Email Matching
```typescript
// Test 1: Same email
// User: john@example.com (Google)
// Link: john@example.com (GitHub)
// Result: ✅ Linked to same user

// Test 2: Different email
// User: john@example.com (Google)
// Try link: john@different.com (GitHub)
// Result: ❌ Creates separate user
```

## Database Queries

### Get user's linked accounts
```sql
SELECT 
  u.email,
  u.emailVerified,
  array_agg(a.provider) as providers
FROM "User" u
LEFT JOIN "Account" a ON u.id = a.userId
WHERE u.email = 'user@example.com'
GROUP BY u.id, u.email, u.emailVerified;
```

### Count users by number of linked accounts
```sql
SELECT 
  COUNT(*) as count,
  CASE 
    WHEN account_count = 0 THEN 'email_only'
    WHEN account_count = 1 THEN 'one_oauth'
    WHEN account_count = 2 THEN 'two_oauth'
    ELSE 'three_plus_oauth'
  END as auth_methods
FROM (
  SELECT u.id, COUNT(a.id) as account_count
  FROM "User" u
  LEFT JOIN "Account" a ON u.id = a.userId
  GROUP BY u.id
) subquery
GROUP BY auth_methods;
```

## Benefits

### User Experience
- ✅ Single account across all providers
- ✅ Choose preferred login method
- ✅ No duplicate accounts
- ✅ Seamless provider switching

### Security
- ✅ Automatic email verification
- ✅ Cannot link wrong accounts
- ✅ Safe unlinking with checks
- ✅ Audit trail in database

### Development
- ✅ PrismaAdapter handles complexity
- ✅ Automatic account linking
- ✅ Type-safe with Prisma
- ✅ Event hooks for customization

---

**Status**: Production Ready
**Using**: NextAuth + Prisma Adapter
**Last Updated**: December 2024
