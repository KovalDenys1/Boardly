# Vibrant Design (#305) — Design Spec

**Goal:** Apply the same vibrant gradient used on the home/lobby/games pages to the remaining muted pages.

**Approach:** Minimal — only change the pages that currently use flat dark or light muted backgrounds. No structural changes.

**Reference gradient:** `from-blue-500 via-purple-600 to-pink-500`

---

## Pages to update

| File | Current background | Change |
|------|--------------------|--------|
| `app/profile/page.tsx` | `from-slate-50 via-blue-50 to-indigo-100` (light) | → vibrant gradient, ensure text is white-compatible |
| `app/leaderboard/page.tsx` | `from-slate-900 via-purple-950 to-slate-900` (dark) | → vibrant gradient |
| `app/admin/layout.tsx` | `bg-slate-950` (flat dark) | → vibrant gradient |
| `app/analytics/page.tsx` | `bg-slate-950` (flat dark) | → vibrant gradient |
| `app/not-found.tsx` | `bg-slate-950` (flat dark) | → vibrant gradient |

## Out of scope

- Header (already vibrant)
- Home, lobby, games, auth pages (already vibrant)
- Game boards and lobby room pages
