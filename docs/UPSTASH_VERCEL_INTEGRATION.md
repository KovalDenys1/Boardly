# Upstash Redis + Vercel Integration Guide

This guide explains how to connect Upstash Redis to your Vercel project, including handling custom prefixes.

## What is Custom Prefix?

When Vercel integrates with external services (like Upstash), it can automatically create environment variables with a **custom prefix** to avoid naming conflicts.

**Example:**
- **No prefix**: Variables are `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- **With prefix "UPSTASH"**: Variables become `UPSTASH_UPSTASH_REDIS_REST_URL` and `UPSTASH_UPSTASH_REDIS_REST_TOKEN`

## Setup Options

### Option 1: Use Custom Prefix (Recommended)

When Vercel asks for a **Custom Prefix**, you can:

1. **Leave it empty** (recommended) - Variables will be:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

2. **Or use a prefix** like `UPSTASH` - Variables will be:
   - `UPSTASH_UPSTASH_REDIS_REST_URL`
   - `UPSTASH_UPSTASH_REDIS_REST_TOKEN`

**The code automatically detects both!** ✅

### Option 2: Map to KV Variables (No Code Changes Needed)

Instead of using Upstash variable names, you can map them to KV variable names:

1. In Vercel, after Upstash creates variables, go to **Environment Variables**
2. Create new variables:
   - `KV_REST_API_URL` = (copy value from `UPSTASH_REDIS_REST_URL`)
   - `KV_REST_API_TOKEN` = (copy value from `UPSTASH_REDIS_REST_TOKEN`)

This way, the code works immediately without any changes!

## Step-by-Step Setup

### 1. Create Upstash Redis Database

1. Go to [upstash.com](https://upstash.com/)
2. Sign up/login
3. Click **Create Database**
4. Choose:
   - **Name**: `boardly-redis`
   - **Type**: Regional (faster) or Global (better for multi-region)
   - **Region**: Choose closest to your users
5. Click **Create**

### 2. Connect to Vercel

1. In Upstash dashboard, click **Integrations** → **Vercel**
2. Select your Vercel project (Boardly)
3. When asked for **Custom Prefix**:
   - **Option A**: Leave empty (recommended)
   - **Option B**: Use prefix like `UPSTASH`
4. Click **Connect**

Vercel will automatically create environment variables!

### 3. Verify Variables in Vercel

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. You should see:
   - `UPSTASH_REDIS_REST_URL` (or `UPSTASH_UPSTASH_REDIS_REST_URL` if you used prefix)
   - `UPSTASH_REDIS_REST_TOKEN` (or `UPSTASH_UPSTASH_REDIS_REST_TOKEN` if you used prefix)

3. Make sure they're enabled for:
   - ✅ Production
   - ✅ Preview
   - ✅ Development (optional)

### 4. Deploy and Test

1. Make a new commit and push (or redeploy)
2. Check Vercel logs - should see no KV connection errors
3. Test rate limiting - should work across requests
4. Check Upstash dashboard - should see command usage

## Code Support

The code automatically detects Upstash variables with or without prefix:

```typescript
// Supports all these patterns:
process.env.KV_REST_API_URL + KV_REST_API_TOKEN
process.env.UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
process.env.UPSTASH_UPSTASH_REDIS_REST_URL + UPSTASH_UPSTASH_REDIS_REST_TOKEN
// ... and any other prefix!
```

## Troubleshooting

### Issue: Variables not detected

**Solution**: 
- Check that variables are set in Vercel
- Verify variable names match (with or without prefix)
- Make sure variables are enabled for the right environment (Production/Preview)

### Issue: "KV connection failed"

**Solution**:
- Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set
- Check Upstash dashboard - database should be active
- Ensure you're using REST API URL (not Redis URL)
- Check Vercel logs for specific error messages

### Issue: Custom prefix not working

**Solution**:
- The code automatically detects any prefix
- If it doesn't work, use Option 2 (map to KV variables)
- Or manually check variable names in Vercel dashboard

## Verification Checklist

- [ ] Upstash Redis database created
- [ ] Connected to Vercel project
- [ ] Environment variables created in Vercel
- [ ] Variables enabled for Production/Preview
- [ ] Deployed to Vercel
- [ ] No errors in Vercel logs
- [ ] Upstash dashboard shows command usage
- [ ] Rate limiting works across requests

## Next Steps

After setup:
1. Monitor usage in Upstash dashboard (free tier: 10,000 commands/day)
2. Check Vercel logs for any connection issues
3. Test rate limiting and bot turn locks

## Additional Resources

- [Upstash Vercel Integration](https://docs.upstash.com/redis/integrations/vercel)
- [Upstash REST API](https://docs.upstash.com/redis/features/restapi)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
