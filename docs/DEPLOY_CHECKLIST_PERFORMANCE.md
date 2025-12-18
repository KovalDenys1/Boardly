# 🚀 Quick Deployment Guide - Performance & Guest Cleanup

## ✅ Pre-Deploy Checklist

### 1. Environment Variables (Vercel Dashboard)
Add `CRON_SECRET` to your Vercel environment variables:

```bash
# Generate random secret
CRON_SECRET=$(openssl rand -hex 32)
# Or manually: any random 32+ character string
```

**Add to Vercel**:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add: `CRON_SECRET` = `your_generated_secret`
3. Select: Production, Preview, Development

### 2. Database Connection (Optional but Recommended)
Verify your `DATABASE_URL` uses **Supabase Pooler** for better performance:

```env
# ✅ Good (Pooler - low latency)
DATABASE_URL="postgresql://user:pass@aws-1-eu-west-1.pooler.supabase.com:6543/postgres"

# ❌ Avoid in production (Direct - high latency)
DATABASE_URL="postgresql://user:pass@aws-1-eu-west-1.aws.supabase.com:5432/postgres"
```

**Current Setup**: Already using pooler ✅ (detected in logs)

---

## 📦 Deployment Steps

### Option A: Git Push (Recommended)
```bash
# Commit all changes
git add .
git commit -m "feat: performance optimizations + guest cleanup system"
git push origin develop

# Merge to main when ready
git checkout main
git merge develop
git push origin main
```

Vercel will automatically:
- Detect changes
- Run `npm run build`
- Apply database migration (via `prisma generate`)
- Deploy to production

### Option B: Manual Deploy
```bash
# From Vercel CLI
vercel --prod
```

---

## 🔍 Post-Deploy Verification

### 1. Check Build Logs
Verify in Vercel Dashboard → Deployments → Latest:
- ✅ Build successful
- ✅ Migration applied: `20251218182133_add_guest_tracking_fields`
- ✅ No TypeScript errors

### 2. Test Cron Job (Manual Trigger)
```bash
# In browser or curl
curl -X GET https://boardly.online/api/cron/cleanup-guests \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Expected response:
# {"success":true,"message":"Guest cleanup completed","timestamp":"..."}
```

**Or check Vercel Logs**:
1. Vercel Dashboard → Logs
2. Filter: Function `/api/cron/cleanup-guests`
3. Wait for next scheduled run (3 AM UTC)

### 3. Verify Speed Insights Improvement
**Timeline**: Wait 24-48 hours for accurate data

Check: Vercel Dashboard → Speed Insights → Desktop

**Expected Improvements**:
| Metric | Before | After | Status |
|--------|--------|-------|--------|
| TTFB | 2.48s | ~1.0s | 🎯 |
| FCP | 2.8s | ~1.5s | 🎯 |
| LCP | 2.53s | ~1.8s | 🎯 |
| CLS | 0.15 | <0.1 | 🎯 |

---

## 🧪 Testing Locally

### Test Performance Changes
```bash
# Start dev server
npm run dev:all

# Open browser
http://localhost:3000

# Check DevTools:
# - Network tab: HomePage should load from cache after first visit
# - Performance tab: Record page load, check LCP/CLS metrics
# - Console: Should see no errors
```

### Test Guest Cleanup Manually
```bash
# Run cleanup script
npm run cleanup:old-guests

# Check output for stats:
# - Number of guests found
# - Number deleted
# - Database stats
```

### Test Cron Endpoint Locally
```bash
# Start server
npm run dev

# In another terminal
curl http://localhost:3000/api/cron/cleanup-guests

# Should work without auth in development
```

---

## 📊 Monitoring

### Week 1 After Deploy
Monitor these metrics daily:

1. **Speed Insights** (Vercel Dashboard)
   - Real Experience Score should climb from 88 → 95+
   - TTFB should drop significantly

2. **Database Size** (Supabase Dashboard)
   - Check `User` table count
   - Should see gradual decrease in guest users
   - Total DB size should stabilize/decrease

3. **Cron Job Logs** (Vercel Dashboard → Logs)
   - Should run daily at 3 AM UTC
   - Check for errors
   - Verify guests are being cleaned

### Commands for Monitoring
```bash
# Check total guests in database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"User\" WHERE \"isGuest\" = true;"

# Check old guests (3+ days inactive)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"User\" WHERE \"isGuest\" = true AND \"lastActiveAt\" < NOW() - INTERVAL '3 days';"

# Check total users
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"User\";"
```

---

## 🚨 Troubleshooting

### Issue: TTFB still high after deploy
**Causes**:
- ISR cache not warmed up yet (wait 1-2 hours)
- Database still using direct connection

**Fix**:
1. Visit homepage multiple times to warm cache
2. Verify DATABASE_URL uses `:6543` port
3. Check Vercel region matches Supabase region

### Issue: Cron job not running
**Causes**:
- `CRON_SECRET` not set in Vercel
- Vercel Cron not enabled for project

**Fix**:
1. Add `CRON_SECRET` to Vercel environment variables
2. Redeploy after adding env var
3. Check Vercel Dashboard → Settings → Cron Jobs (should show `/api/cron/cleanup-guests`)

### Issue: Build fails with TypeScript errors
**Error**: `Argument of type 'unknown' is not assignable to parameter of type 'Error'`

**Fix**:
Already fixed in `app/api/cron/cleanup-guests/route.ts` (line 42):
```typescript
log.error('Guest cleanup cron failed', error as Error)
```

### Issue: Guests not being deleted
**Debug**:
```bash
# Check if any old guests exist
npm run cleanup:old-guests

# If output shows 0 guests:
# - All guests are active (good!)
# - Or isGuest field not set correctly (check join-guest route)

# Manually inspect database
npm run db:studio
# Navigate to User table → Filter: isGuest = true
```

---

## 📝 Rollback Plan

If something breaks:

### Quick Rollback (Vercel)
1. Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "⋮" → Promote to Production

### Database Rollback
```bash
# If migration causes issues, revert
npx prisma migrate resolve --rolled-back 20251218182133_add_guest_tracking_fields

# Then remove fields from schema.prisma and create new migration
npx prisma migrate dev --name revert_guest_tracking
```

**Note**: Database rollback will lose guest tracking. Only do if critical issues.

---

## 🎯 Success Criteria

Deploy is successful when:
- ✅ Build completes without errors
- ✅ All tests pass (129/129)
- ✅ Homepage loads in <2s (TTFB)
- ✅ No CLS issues (score <0.1)
- ✅ Cron job runs daily at 3 AM UTC
- ✅ Guest count decreases over time
- ✅ No user-reported issues

---

## 📚 Related Documentation
- [Full Performance Guide](./PERFORMANCE_OPTIMIZATIONS_DEC2024.md)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Next.js ISR](https://nextjs.org/docs/basic-features/data-fetching/incremental-static-regeneration)

---

**Questions?** Check logs first:
- Vercel: Dashboard → Logs → Filter by function/route
- Local: `npm run dev:all` → Check terminal output
- Database: `npm run db:studio` → Inspect data

**Last Updated**: December 18, 2024
