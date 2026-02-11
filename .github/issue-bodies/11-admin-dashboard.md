## 📋 Issue Description

Create internal admin dashboard for managing users, games, and platform operations - user support, moderation, and monitoring.

## 🎯 Goal

Provide administrators with tools to manage the platform, handle user support requests, moderate content, and monitor system health.

## ✅ Acceptance Criteria

- [ ] Add `role` field to Users table (`user` | `admin`)
- [ ] Create admin middleware to protect routes
- [ ] Build admin dashboard at `/admin` (protected route)
- [ ] **User Management**:
  - List all users (pagination, search, filters)
  - View user details (games, stats, account info)
  - Suspend/unsuspend user accounts
  - Delete user accounts (with confirmation)
  - Reset user passwords
  - View user activity logs
- [ ] **Game Management**:
  - List all games (active, completed, abandoned)
  - View game details (players, moves, state)
  - Force-end stuck games
  - Delete spam/test games
- [ ] **Content Moderation**:
  - View reported content (future - need reporting system)
  - Ban users for violations
  - Review chat logs
- [ ] **System Monitoring**:
  - Active users count
  - Games in progress
  - Database stats (total users, games, etc.)
  - Error log viewer (Sentry integration)
- [ ] Audit log for admin actions
- [ ] Mobile-responsive admin UI
- [ ] Deploy to production

## 📝 Implementation Notes

**Schema Update**:

```prisma
model Users {
  // ... existing fields
  role      Role @default(USER)
  suspended Boolean @default(false)
  @@index([role])
}

enum Role {
  USER
  ADMIN
}

model AdminAuditLog {
  id        String   @id @default(cuid())
  adminId   String
  admin     User     @relation(fields: [adminId], references: [id])
  
  action    String   // 'suspend_user', 'delete_game', etc.
  targetType String  // 'user', 'game', 'lobby'
  targetId   String
  details   Json     // Additional context
  
  createdAt DateTime @default(now())
  
  @@index([adminId, createdAt])
}
```

**Admin Middleware**:

```typescript
// middleware/admin.ts
export function requireAdmin(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' })
  }
}
```

**Admin Routes**:

- GET `/admin` - Dashboard overview
- GET `/admin/users` - User list
- GET `/admin/users/[id]` - User details
- POST `/admin/users/[id]/suspend` - Suspend user
- DELETE `/admin/users/[id]` - Delete user
- GET `/admin/games` - Game list
- POST `/admin/games/[id]/force-end` - Force-end game
- GET `/admin/audit-logs` - View admin actions

**Dashboard Widgets**:

- Active users (last 24h)
- Games in progress
- Total registered users
- Total games played
- Active lobbies
- Recent errors (Sentry link)
- System health indicators

**UI Components**:

- `components/Admin/UserTable.tsx`
- `components/Admin/GameTable.tsx`
- `components/Admin/StatsCards.tsx`
- `components/Admin/AuditLog.tsx`

## 🧪 Testing Requirements

- [ ] Test admin role enforcement (non-admins can't access)
- [ ] Verify user suspension prevents login
- [ ] Test force-end game functionality
- [ ] Check audit log records all actions
- [ ] Test pagination and search
- [ ] Mobile responsive testing

## 📊 Estimated Complexity

**L (Large - 2-3 sprints / 2-3 weeks)**

- Week 1: Schema, middleware, user management
- Week 2: Game management, moderation tools
- Week 3: Monitoring, audit log, polish

## 🔒 Security Considerations

- Protect all admin routes with middleware
- Log all admin actions in audit log
- Require confirmation for destructive actions (delete user, ban)
- Rate limit admin API calls
- Two-factor auth for admin accounts (future)

## 🔗 Related Issues

- Essential for platform management
- Needed before public launch
- Prerequisite for content moderation

## 📚 Additional Context

**Priority**: Q2-Q3 2026 (needed before scaling)

**Admin Users**: Initially just project owner, expand as needed

**Design Inspiration**:

- WordPress admin panel
- Supabase dashboard
- Firebase console

**Future Enhancements**:

- Content moderation queue
- User analytics (cohort analysis)
- A/B testing controls
- Feature flags management
