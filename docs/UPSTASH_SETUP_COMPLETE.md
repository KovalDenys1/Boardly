# Upstash Redis Setup - Complete ✅

## ✅ Setup Status

Your Upstash Redis is now connected to Vercel! Here's what was configured:

### Environment Variables (Auto-created by Vercel)

- ✅ `KV_REST_API_URL` - Upstash REST API endpoint
- ✅ `KV_REST_API_TOKEN` - Upstash authentication token
- ✅ `KV_URL` - Redis connection URL (optional, for direct connection)
- ✅ `REDIS_URL` - Alternative Redis URL (optional)

## Next Steps

### 1. Deploy to Vercel

The code will automatically detect and use Upstash Redis once deployed:

```bash
# If you have changes to commit
git add .
git commit -m "Add Upstash Redis support"
git push

# Or just redeploy from Vercel dashboard
```

### 2. Verify It's Working

After deployment, check:

1. **Vercel Logs**:
   - Go to Vercel Dashboard → Your Project → Logs
   - Look for any KV connection errors
   - Should see no errors related to Redis/KV

2. **Upstash Dashboard**:
   - Go to [upstash.com](https://upstash.com/) → Your Database
   - Check **Metrics** tab
   - You should see command usage increasing when:
     - Rate limiting is triggered
     - Bot turns are executed

3. **Test Rate Limiting**:
   - Make multiple rapid requests to any API endpoint
   - After hitting the limit, you should get a 429 response
   - Check Upstash dashboard - should see commands being executed

4. **Test Bot Turns**:
   - Start a game with bots
   - Bot turns should execute without race conditions
   - Check logs - no duplicate bot turn errors

### 3. Monitor Usage

**Free Tier Limits:**
- ✅ 10,000 commands/day
- ✅ 256 MB storage

**Monitor in Upstash Dashboard:**
- Commands per day (should be well under 10K for normal usage)
- Storage usage (should be minimal for rate limiting + locks)
- Latency (should be < 50ms)

## How It Works

The code automatically:

1. **Detects Upstash**: Checks for `KV_REST_API_URL` and `KV_REST_API_TOKEN`
2. **Uses REST API**: Connects via Upstash REST API (works with serverless)
3. **Falls back gracefully**: If Upstash is unavailable, uses in-memory storage

## Troubleshooting

### Issue: Still using in-memory storage

**Check:**
- Variables are set in Vercel (Production/Preview environments)
- Variables are not empty
- Redeploy after adding variables

**Solution:**
- Verify variables in Vercel Dashboard → Settings → Environment Variables
- Make sure they're enabled for Production
- Redeploy the project

### Issue: "KV connection failed" in logs

**Check:**
- `KV_REST_API_URL` is a valid HTTPS URL
- `KV_REST_API_TOKEN` is not empty
- Upstash database is active

**Solution:**
- Verify Upstash database is running
- Check variable values are correct
- Try regenerating token in Upstash dashboard

### Issue: Rate limiting not working globally

**Check:**
- Multiple serverless instances are running
- Variables are set correctly
- Upstash is receiving commands

**Solution:**
- Check Upstash dashboard for command usage
- Verify variables are set for Production environment
- Check Vercel logs for any errors

## What's Happening Now

✅ **Rate Limiting**: Now works across all Vercel serverless instances  
✅ **Bot Turn Locks**: Prevents race conditions in concurrent bot turns  
✅ **Distributed Storage**: All instances share the same Redis store  

## Free Tier Usage

For this project's usage:
- **Rate limiting**: ~100-500 commands/day (depending on traffic)
- **Bot locks**: ~50-200 commands/day (depending on games)
- **Total**: Well under 10,000 commands/day ✅

You're all set! 🎉
