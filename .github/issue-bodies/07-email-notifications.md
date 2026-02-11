## 📋 Issue Description

Implement email notification system to notify users when they're invited to games, when it's their turn, or when a friend request is received.

## 🎯 Goal

Improve user engagement by notifying users of game-related events via email, bringing them back to the platform.

## ✅ Acceptance Criteria

- [ ] Create `Notifications` table in Prisma schema
- [ ] Add notification preferences to user settings (enable/disable per type)
- [ ] Implement email templates for:
  - Game invite received
  - Your turn reminder (for long-running games)
  - Friend request received
  - Friend request accepted
- [ ] Create notification queue system (avoid spam, batch notifications)
- [ ] Add unsubscribe link to all notification emails
- [ ] Respect user preferences (don't send if disabled)
- [ ] Add "Send Invite" button in game lobbies
- [ ] Create notification settings page in profile
- [ ] Rate limit notifications (max 1 per game per hour for turn reminders)
- [ ] Test email delivery with Resend
- [ ] Deploy to production

## 📝 Implementation Notes

**Resend Integration**: Already configured (`lib/email.ts`)

- Used for auth emails (verification, password reset)
- Extend for game notifications

**Notification Types**:

```typescript
enum NotificationType {
  GAME_INVITE = 'game_invite'
  TURN_REMINDER = 'turn_reminder'
  FRIEND_REQUEST = 'friend_request'
  FRIEND_ACCEPTED = 'friend_accepted'
}
```

**Preferences Schema**:

```prisma
model NotificationPreferences {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  gameInvites    Boolean @default(true)
  turnReminders  Boolean @default(true)
  friendRequests Boolean @default(true)
  friendAccepted Boolean @default(true)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Email Templates** (in `lib/email-templates/`):

- `game-invite.tsx` - "You've been invited to play [Game Name]!"
- `turn-reminder.tsx` - "It's your turn in [Game Name]!"
- `friend-request.tsx` - "[User] sent you a friend request"
- `friend-accepted.tsx` - "[User] accepted your friend request"

**Notification Queue** (prevent spam):

- Don't send turn reminder if user recently visited
- Batch multiple notifications (digest email)
- Respect time zones (don't send at 3 AM)

**API Endpoints**:

- `POST /api/notifications/send` - Send notification
- `GET/PUT /api/user/notification-preferences` - Get/update preferences
- `POST /api/notifications/unsubscribe` - Unsubscribe from all

## 🧪 Testing Requirements

- [ ] Test all email templates render correctly
- [ ] Verify unsubscribe links work
- [ ] Test rate limiting (max 1 turn reminder/hour)
- [ ] Verify preferences are respected (disabled = no email)
- [ ] Test with real email addresses
- [ ] Check spam score (ensure emails don't go to spam)

## 📊 Estimated Complexity

**M (Medium - 1 sprint / 1 week)**

- Day 1-2: Schema, preferences, API endpoints
- Day 3-4: Email templates, queue system
- Day 5: Testing, deployment

## 🔗 Related Issues

- Enhances user engagement
- Works with existing Resend integration
- Related to friend system (friend notification triggers)

## 📚 Additional Context

**Resend Docs**: <https://resend.com/docs>
**Current Usage**: Auth emails only (`lib/email.ts` - sendVerification, sendPasswordReset)

**Design Considerations**:

- Respect user privacy (clear opt-out mechanism)
- Don't spam (rate limiting, batching)
- Mobile-friendly email templates
- Clear call-to-action buttons ("Play Now", "View Request")

**Priority**: Q2 2026 (after basic games are implemented)
