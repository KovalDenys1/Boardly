# Render Deployment Checklist

## Socket Server (boardly-websocket)

### Environment Variables to Set:
```bash
NODE_ENV=production
PORT=10000
HOSTNAME=0.0.0.0
CORS_ORIGIN=https://boardly.online,https://www.boardly.online
DATABASE_URL=<your-supabase-connection-string>
JWT_SECRET=<same-as-nextjs-app>
```

### Verify:
- [ ] Service starts successfully (check logs)
- [ ] Health endpoint works: `curl https://boardly-websocket.onrender.com/health`
- [ ] No authentication errors in logs
- [ ] CORS allows your production domain

## Next.js App (boardly)

### Environment Variables to Add/Update:
```bash
# Socket.IO Configuration
NEXT_PUBLIC_SOCKET_URL=https://boardly-websocket.onrender.com
SOCKET_SERVER_URL=https://boardly-websocket.onrender.com

# All other existing variables...
```

### Verify:
- [ ] App builds successfully
- [ ] Can access homepage
- [ ] Socket URL is correct in browser console
- [ ] Can create/join lobbies
- [ ] Real-time updates work

## Testing After Deploy

### 1. Quick Test
```bash
# Test socket health
curl https://boardly-websocket.onrender.com/health
# Expected: {"ok":true}

# Test Next.js
curl https://www.boardly.online/
# Expected: HTML response
```

### 2. Browser Test
1. Open https://www.boardly.online
2. Open browser console
3. Look for: `🔌 Using explicit Socket URL from env: https://boardly-websocket.onrender.com`
4. Create or join a lobby
5. Verify real-time updates work (chat, game state)

### 3. Monitor Logs
- Watch Render logs for both services
- Look for:
  - ✅ Successful connections
  - 🔌 Socket connections
  - ❌ Any errors

## Common Issues After Deploy

### Issue: "WebSocket connection failed"
**Fix:** 
- Check CORS_ORIGIN includes your domain
- Verify NEXT_PUBLIC_SOCKET_URL is set correctly
- Wait 1-2 minutes for cold start

### Issue: "Authentication failed"
**Fix:**
- Ensure JWT_SECRET is the same on both services
- Check session is being sent correctly

### Issue: Slow initial connection
**Expected on Render free tier:**
- First connection after 15min inactivity = 30-120s
- Subsequent connections = instant
- Consider keeping warm with UptimeRobot (free)

## Monitoring

### Render Dashboard
- Check CPU/Memory usage
- Monitor logs for errors
- Set up alerts for service down

### Sentry (if configured)
- Review error reports
- Set up alerts for critical issues

## Rollback Plan

If issues occur:
1. Revert to previous commit
2. Trigger manual deploy on Render
3. Clear build cache if needed
4. Check environment variables haven't changed

## Post-Deploy Checklist

- [ ] Homepage loads
- [ ] Can login/register
- [ ] Can create lobby
- [ ] Can join lobby
- [ ] Real-time chat works
- [ ] Game starts successfully
- [ ] Dice rolls update in real-time
- [ ] Game completes and shows results
- [ ] No errors in browser console
- [ ] No errors in Render logs
