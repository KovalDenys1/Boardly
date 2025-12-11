# Discord OAuth Setup Guide

## Step-by-Step Configuration

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Enter application name: **"Boardly"** (or your preferred name)
4. Click **"Create"**

### 2. Configure OAuth2 Settings

1. In your application, go to **OAuth2** section from left sidebar
2. Click **"OAuth2"** → **"General"**

3. Add **Redirect URIs**:
   - For development: `http://localhost:3000/api/auth/callback/discord`
   - For production: `https://boardly.online/api/auth/callback/discord`
   
   **Important**: 
   - Must be exact match (including http/https)
   - No trailing slashes
   - Case-sensitive

4. **Scopes** (automatically handled by NextAuth):
   - `identify` - Get user's basic info
   - `email` - Get user's email address

### 3. Get Client ID and Secret

1. In **OAuth2** → **General** page:
   - **Client ID**: Copy this value
   - **Client Secret**: Click **"Reset Secret"** if needed, then copy

2. **Keep these secure!** Never commit to git.

### 4. Add to Environment Variables

**Development** (`.env.local`):
```env
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
```

**Production** (Vercel/hosting dashboard):
```env
DISCORD_CLIENT_ID=production_client_id
DISCORD_CLIENT_SECRET=production_client_secret
```

### 5. Configure Application Icon (Optional)

1. Go to **General Information**
2. Upload app icon (512x512 recommended)
3. Add description
4. Save changes

### 6. Restart Development Server

```bash
# Stop servers (Ctrl+C)
npm run dev:all
```

## Testing Discord OAuth

### Local Testing

1. **Start servers**:
   ```bash
   npm run dev:all
   ```

2. **Go to login page**:
   ```
   http://localhost:3000/auth/login
   ```

3. **Click "Sign in with Discord"**

4. **Discord authorization screen should appear**:
   - Shows: "Boardly wants to access your account"
   - Permissions: Access your username and email
   - Click **"Authorize"**

5. **Should redirect back to app**:
   - User is signed in
   - Profile shows email verified ✅
   - Discord account is linked

### Verify in Database

```bash
npx tsx scripts/check-oauth-verification.ts
```

Should show:
```
User: your_username
  Email: your@email.com
  Providers: discord
  Status: ✅ Verified
```

### Check Profile Page

1. Go to: `http://localhost:3000/profile`
2. Scroll to **Connected Accounts**
3. Discord should show **"Unlink"** button (not "Connect")

## Common Issues

### "Invalid Redirect URI"
**Cause**: Redirect URI mismatch
**Solution**:
1. Check exact URL in Discord settings
2. Ensure no trailing slash: ❌ `/callback/discord/` ✅ `/callback/discord`
3. Check http vs https
4. Restart servers after adding

### "Invalid Client"
**Cause**: Wrong Client ID or Secret
**Solution**:
1. Regenerate secret in Discord portal
2. Copy exact values (no spaces)
3. Update `.env.local`
4. Restart servers

### "Access Denied"
**Cause**: User clicked "Cancel" on Discord
**Solution**: Normal behavior, user can try again

### Discord Button Shows "Connect" After Login
**Cause**: Account not properly linked
**Solution**:
1. Check Prisma Adapter is configured
2. Verify `/api/user/linked-accounts` returns Discord account
3. Check database for Account record

## Discord OAuth Flow

### Visual Flow
```
User clicks "Sign in with Discord"
    ↓
Redirect to Discord authorization
    ↓
User authorizes (or cancels)
    ↓
Discord redirects to /api/auth/callback/discord
    ↓
NextAuth handles:
  - Exchange code for tokens
  - Get user info from Discord
  - Check if user exists by email
    ↓
If new user:
  - Create User record
  - Create Account record (provider: discord)
  - Set emailVerified = now()
    ↓
If existing user:
  - Create Account record (link to existing user)
  - Update emailVerified if needed
    ↓
Sign user in
    ↓
Redirect to home page
```

## Security Best Practices

### Environment Variables
```env
# ✅ Good
DISCORD_CLIENT_ID=1234567890
DISCORD_CLIENT_SECRET=abcdef123456

# ❌ Bad (quoted, has spaces)
DISCORD_CLIENT_ID="1234567890"
DISCORD_CLIENT_SECRET=" abcdef123456 "
```

### Bot Account vs OAuth
- **OAuth2**: For user login (what we're using)
- **Bot Account**: For Discord bot features (not needed)
- Don't confuse Bot Token with OAuth Client Secret

### Rate Limiting
Discord API has rate limits:
- OAuth: 50 requests per 10 seconds per IP
- Should be fine for normal usage
- NextAuth handles retry logic

## Production Deployment

### Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   ```
   DISCORD_CLIENT_ID = your_production_id
   DISCORD_CLIENT_SECRET = your_production_secret
   ```
3. Redeploy

### Important
- Use **different** Discord application for production
- Update redirect URI to production domain
- Never use development credentials in production

## Monitoring

### Check Discord Application Stats
1. Go to Discord Developer Portal
2. Select your application
3. View **OAuth2** → **General**
4. See: Number of authorizations, active users

### Database Check
```sql
-- Count Discord users
SELECT COUNT(*) 
FROM "Account" 
WHERE provider = 'discord';

-- Recent Discord sign-ins
SELECT u.email, u.emailVerified, a.createdAt
FROM "User" u
JOIN "Account" a ON u.id = a.userId
WHERE a.provider = 'discord'
ORDER BY a.createdAt DESC
LIMIT 10;
```

## Discord OAuth Scopes

### Required Scopes (Handled by NextAuth)
- **identify**: Get user ID, username, avatar
- **email**: Get verified email address

### Optional Scopes (Not needed)
- `guilds`: See user's Discord servers
- `connections`: See connected accounts
- `role_connections.write`: Manage role connections

**We only use**: `identify` + `email`

## Troubleshooting Commands

### Test Discord OAuth endpoint
```bash
# Should return Discord OAuth login page
curl "http://localhost:3000/api/auth/signin/discord"
```

### Check NextAuth configuration
```bash
# In browser console
fetch('/api/auth/providers')
  .then(r => r.json())
  .then(console.log)

# Should show discord in the list
```

### Verify environment variables loaded
```typescript
// Add to any API route temporarily
console.log('Discord configured:', {
  hasId: !!process.env.DISCORD_CLIENT_ID,
  hasSecret: !!process.env.DISCORD_CLIENT_SECRET
})
```

## Additional Resources

- [Discord OAuth2 Documentation](https://discord.com/developers/docs/topics/oauth2)
- [NextAuth Discord Provider](https://next-auth.js.org/providers/discord)
- [Discord Developer Portal](https://discord.com/developers/applications)

## Quick Checklist

- [ ] Discord application created
- [ ] Redirect URI added (localhost + production)
- [ ] Client ID copied to `.env.local`
- [ ] Client Secret copied to `.env.local`
- [ ] Servers restarted
- [ ] Can see "Sign in with Discord" button
- [ ] Authorization flow works
- [ ] User signed in successfully
- [ ] Email is verified ✅
- [ ] Discord shows "Unlink" in profile

---

**Status**: Ready to Configure
**Difficulty**: Easy (5 minutes)
**Last Updated**: December 2024
