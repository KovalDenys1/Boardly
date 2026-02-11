# Production Deployment Guide

Complete checklist for deploying Boardly to production.

## Pre-Deployment Checklist

### 1. Environment Variables

#### Required Variables
```bash
# Node Environment
NODE_ENV=production

# Database
DATABASE_URL=postgresql://...  # Supabase connection string

# Authentication Secrets (CRITICAL - Generate new ones!)
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=https://your-domain.com

# Email Service (Required for production)
RESEND_API_KEY=re_...
EMAIL_FROM="Boardly <noreply@your-domain.com>"

# Socket.IO
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.onrender.com
CORS_ORIGIN=https://your-domain.com
PORT=3001
HOSTNAME=0.0.0.0

# Cron Job Security
CRON_SECRET=<generate-with-openssl-rand-base64-32>
```

#### Optional but Recommended
```bash
# OAuth Providers
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...

# Error Monitoring
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=...  # For source map uploads

# Logging
LOG_LEVEL=info
```

### 2. Security Checklist

- [ ] All secrets are generated with `openssl rand -base64 32`
- [ ] No `.env` or `.env.local` files committed to git
- [ ] `.gitignore` includes all environment files
- [ ] CORS_ORIGIN is set to production domains only
- [ ] CSP headers configured in middleware.ts
- [ ] Rate limiting enabled on all auth endpoints
- [ ] Database connection uses SSL (Supabase default)
- [ ] OAuth redirect URIs configured in provider dashboards

### 3. Database Setup

```bash
# Run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Verify connection
npm run db:studio
```

#### Database Indexes Verification
All critical indexes are already in `schema.prisma`:
- User: `email`, `username`, `isGuest + lastActiveAt`
- Lobby: `code`, `isActive`, `createdAt`, `creatorId`
- Game: `lobbyId`, `status`, `createdAt`
- Player: `gameId`, `userId`, `gameId + userId`
- FriendRequest: `senderId`, `receiverId`, `status`
- Friendship: `user1Id`, `user2Id`

### 4. Code Quality Check

- [ ] No `console.log` statements in production code (use logger)
- [ ] All error handlers use try-catch and logger
- [ ] No personal information in code comments
- [ ] All user-facing text uses i18n (no hardcoded strings)
- [ ] TypeScript errors: `npm run build` succeeds
- [ ] Tests passing: `npm test`

### 5. Performance Optimization

Already configured in `next.config.js`:
- ✅ Output: `standalone` for smaller Docker images
- ✅ Image optimization with AVIF/WebP
- ✅ Webpack bundle splitting
- ✅ Package imports optimization
- ✅ Compression enabled
- ✅ Powered-by header disabled

Socket.IO optimizations in `socket-server.ts`:
- ✅ Ping timeout: 120s for cold starts
- ✅ Polling first, then WebSocket upgrade
- ✅ Rate limiting on socket events

## Deployment Steps

### Option 1: Vercel (Next.js Frontend)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel --prod
   ```

3. **Configure Environment Variables**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add all required variables from section 1
   - Set `NODE_ENV=production`

4. **Configure Cron Jobs**
   - Already configured in `vercel.json`:
     - Cleanup unverified users: Daily at 2 AM
     - Cleanup old guests: Daily at 3 AM

5. **Verify Deployment**
   - Check health: `https://your-domain.com/`
   - Test authentication
   - Test game creation

### Option 2: Render (Socket.IO Server)

1. **Create New Web Service**
   - Connect GitHub repository
   - Use `render.yaml` configuration

2. **Configure Environment Variables**
   - Add all Socket.IO variables from section 1
   - Set `NODE_ENV=production`

3. **Deploy**
   - Render auto-deploys on git push
   - Monitor logs in Render dashboard

4. **Health Check**
   - Endpoint: `/health`
   - Should return `{"ok": true}`

5. **Keep Alive (Free Tier)**
   - Use `scripts/keep-socket-alive.js` as a cron job
   - Or upgrade to paid plan to avoid cold starts

### Option 3: Self-Hosted (Docker)

1. **Build Production Image**
   ```bash
   docker build -t boardly .
   ```

2. **Run with Environment Variables**
   ```bash
   docker run -d \
     --name boardly \
     -p 3000:3000 \
     -p 3001:3001 \
     --env-file .env.production \
     boardly
   ```

3. **Use Docker Compose** (recommended)
   ```yaml
   version: '3.8'
   services:
     app:
       build: .
       ports:
         - "3000:3000"
         - "3001:3001"
       env_file:
         - .env.production
       restart: unless-stopped
   ```

## Post-Deployment Verification

### 1. Functional Testing

- [ ] Homepage loads correctly
- [ ] User registration works
- [ ] Email verification sent
- [ ] OAuth providers work (Google, GitHub, Discord)
- [ ] User can create lobby
- [ ] Game starts and plays correctly
- [ ] WebSocket connection stable
- [ ] Chat messages work
- [ ] Bot players function
- [ ] Game completion and scoring

### 2. Performance Testing

- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] Socket.IO reconnection works
- [ ] No memory leaks (check after 1 hour)

### 3. Monitoring Setup

- [ ] Sentry error tracking configured
- [ ] Sentry receiving errors (test with intentional error)
- [ ] Database connection pool monitored
- [ ] Socket.IO connections logged
- [ ] Rate limiting logs visible

### 4. Security Verification

- [ ] HTTPS enabled and working
- [ ] Security headers present (check with securityheaders.com)
- [ ] No sensitive data in client-side bundles
- [ ] CORS configured correctly
- [ ] Rate limiting active on auth endpoints
- [ ] OAuth redirect URIs match production

### 5. Database Health

- [ ] Migrations applied successfully
- [ ] Indexes created
- [ ] Connection pooler working
- [ ] No slow queries (check logs)
- [ ] Backup configured (Supabase auto-backup)

## Maintenance Tasks

### Daily
- Monitor Sentry for errors
- Check Socket.IO connection logs
- Verify cron jobs ran successfully

### Weekly
- Review database size growth
- Check for stuck/abandoned games
- Review rate limit violations
- Update dependencies (`npm outdated`)

### Monthly
- Security updates: `npm audit fix`
- Review and rotate API keys if needed
- Database performance review
- Cost optimization review

## Troubleshooting

### Issue: Socket.IO Disconnects

**Solution:**
1. Check CORS_ORIGIN matches production domain
2. Verify WebSocket support on hosting provider
3. Check client logs for connection errors
4. Increase pingTimeout in socket-server.ts

### Issue: Authentication Fails

**Solution:**
1. Verify NEXTAUTH_URL matches domain
2. Check NEXTAUTH_SECRET is set
3. Verify OAuth callback URLs configured
4. Check browser cookies enabled

### Issue: Database Connection Errors

**Solution:**
1. Verify DATABASE_URL correct
2. Check Supabase connection pooler used
3. Review connection pool size
4. Check IP whitelist in Supabase (if applicable)

### Issue: Email Not Sending

**Solution:**
1. Verify RESEND_API_KEY set
2. Check EMAIL_FROM domain verified in Resend
3. Review Resend dashboard for errors
4. Check rate limits not exceeded

## Rollback Plan

If deployment fails:

1. **Vercel**: Instant rollback via dashboard
   - Go to Deployments
   - Find previous working deployment
   - Click "Promote to Production"

2. **Render**: Redeploy previous commit
   - Go to Service → Manual Deploy
   - Select previous commit SHA

3. **Database**: No rollback needed
   - Migrations are forward-only
   - Previous code compatible with new schema

## Support & Resources

- **Documentation**: `docs/`
- **Issue Tracker**: GitHub Issues
- **Socket Troubleshooting**: `docs/SOCKET_TROUBLESHOOTING.md`
- **Performance Guide**: `docs/PERFORMANCE_OPTIMIZATIONS.md`

## Final Checklist

Before marking deployment as complete:

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] OAuth providers tested
- [ ] Email verification works
- [ ] Socket.IO connections stable
- [ ] Monitoring configured
- [ ] Security headers verified
- [ ] Performance benchmarks met
- [ ] Error tracking active
- [ ] Documentation updated
- [ ] Team notified of deployment

---

**Last Updated**: December 2025  
**Maintainer**: Boardly Development Team
