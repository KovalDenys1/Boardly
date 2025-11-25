# Boardly Launch Plan (19 Nov → 1 Jan)

> Goal: reach a production-ready state with monetization enabled and polished core games by Jan 1.

## How to Use This Document
- Each row represents the main goal for the day. Update status `TODO` → `DOING` → `DONE`.
- If a day finishes with open items, move them to the nearest free day and add `MOVED`.
- Review the upcoming week every Monday and adjust priorities if necessary (avoid mid-day context switches).
- Log daily outcomes in the “Reports” section (one-line summary, any blockers).

## Daily Milestones

| Date | Focus | Key Deliverables | Status |
| --- | --- | --- | --- |
| Nov 19 (Tue) | Inventory | Full audit of shipped features/debts, log all bugs & UX gaps in tracker | DONE |
| Nov 20 (Wed) | Infrastructure | Stand up CI for lint/test/build and enforce PR quality gates | DONE |
| Nov 21 (Thu) | Backend stability | Harden lobby lifecycle & reconnect flows, add log monitoring | DONE |
| Nov 22 (Fri) | Client perf | Split oversized pages, enable code-splitting, profile renders | PARTIAL |
| Nov 23 (Sat) | UX polish | Add skeletons/loaders, inline tips, accessibility fixes | PARTIAL |
| Nov 24 (Sun) | Test day | Write smoke + integration tests for APIs and critical flows | PARTIAL |
| Nov 25 (Mon) | Yahtzee balance | Validate scoring logic, fix gameplay bugs, draft QA checklist | DONE |
| Nov 26 (Tue) | Notifications | Configure email / web push for invites and reminders | TODO |
| Nov 27 (Wed) | Auth hardening | Implement password recovery, brute-force protection, auth logs | TODO |
| Nov 28 (Thu) | SEO/marketing | Finalize SEO guide, update landing meta tags, refresh sitemap | TODO |
| Nov 29 (Fri) | Payments research | Choose provider (Stripe/Lemon Squeezy) and sketch pricing | TODO |
| Nov 30 (Sat) | Documentation | Refresh README/CONTRIBUTING, add docs/ROADMAP.md | TODO |
| Dec 1 (Sun) | Analytics | Integrate PostHog/Plausible, define activation & retention KPIs | TODO |
| Dec 2 (Mon) | Guess the Spy design | Spec rules, UX flow, state diagram, data model draft | TODO |
| Dec 3 (Tue) | Guess the Spy backend | DB schema, API contract, initial socket events | TODO |
| Dec 4 (Wed) | Guess the Spy frontend | Build UI prototype, handling of all game states | TODO |
| Dec 5 (Thu) | Guess the Spy QA | Unit + integration tests, QA checklist, enable behind flag | TODO |
| Dec 6 (Fri) | Production rehearsal | Staging end-to-end run (Yahtzee + Guess the Spy) | TODO |
| Dec 7 (Sat) | Feedback loop | Gather insights from 5–10 users, triage improvement backlog | TODO |
| Dec 8 (Sun) | Tech debt | Close minor bugs/refactors lingering in backlog | TODO |
| Dec 9 (Mon) | Chess polish | Improve AI/move validation, mobile responsiveness | TODO |
| Dec 10 (Tue) | Lobby experience | New lobby list page, filters, friend search | TODO |
| Dec 11 (Wed) | Social features | Lightweight friends list, chat upgrades, moderation tools | TODO |
| Dec 12 (Thu) | Monetization UX | Design paywall/upsell flows, configure trial experience | TODO |
| Dec 13 (Fri) | Payments implementation | Integrate Stripe checkout, webhooks, premium role gating | TODO |
| Dec 14 (Sat) | Billing ops | Test payments, receipts, billing profile management | TODO |
| Dec 15 (Sun) | Data safety | DB backup scripts + export of game logs | TODO |
| Dec 16 (Mon) | Observability | Logging, alerting, uptime dashboards (Grafana/Sentry) | TODO |
| Dec 17 (Tue) | Scaling review | Load-test socket server, optimize hot queries | TODO |
| Dec 18 (Wed) | Security pass | Pen-test checklist, tighten CSP, review rate limits | TODO |
| Dec 19 (Thu) | Mobile polish | PWA manifest, push notifications, responsive QA sweep | TODO |
| Dec 20 (Fri) | Marketing assets | Landing updates, screenshots, store copy, welcome email series | TODO |
| Dec 21 (Sat) | Community setup | Launch Discord/Telegram, rules, onboarding scripts | TODO |
| Dec 22 (Sun) | Support ops | Build FAQ, automate ticket intake, reply templates | TODO |
| Dec 23 (Mon) | Holiday campaign | Plan New Year promo, prepare gift codes | TODO |
| Dec 24 (Tue) | Release candidate | Feature freeze, build RC, run smoke tests | TODO |
| Dec 25 (Wed) | Monitoring day | Observe metrics, capture bugs, hotfix if needed | TODO |
| Dec 26 (Thu) | Post-mortem #1 | Review RC outcome, finalize blocker list | TODO |
| Dec 27 (Fri) | Blocker fixes | Resolve critical defects from post-mortem | TODO |
| Dec 28 (Sat) | UX final sweep | Validate all key flows, microcopy, localization | TODO |
| Dec 29 (Sun) | Launch infra | Verify DNS/CDN/backups, document emergency runbooks | TODO |
| Dec 30 (Mon) | Soft launch | Invite 50–100 users, monitor funnel metrics | TODO |
| Dec 31 (Tue) | Monetization check | Validate payments, analyze churn, tune paid onboarding | TODO |
| Jan 1 (Wed) | Public launch | Announcements, marketing push, enable full monetization | TODO |

## Reports
- Use this space for daily notes (date + short summary + blockers).
- Example: `Nov 19 — DONE. Backlog of 37 items created, 3 critical lobby reconnect bugs logged.`
- Nov 19 — DONE. Feature + tech-debt audit captured in `docs/audit/2024-11-19.md`; logged 13 blocking issues.
- Nov 20 — DONE. Added `npm run lint` script and `.github/workflows/ci.yml` so PRs run lint + build automatically.
- Nov 21 — DONE. Fixed 9 npm vulnerabilities, removed production console.logs, fixed bugs B1-B3, installed Sentry monitoring. WebSocket stability improved.
- Nov 22–24 — PARTIAL. Code quality improvements: fixed socket.io versions, removed hardcoded hostnames, comprehensive testing completed. Full perf/UX/test suite pending.
- Nov 25 — DONE. Yahtzee validation complete: 32/32 scoring tests passed, fixed critical hold move bug, QA checklist created (`docs/YAHTZEE_QA_CHECKLIST.md`). Game ready!
