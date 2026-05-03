# Documentation Index

This folder contains the canonical project documentation.

## Core docs

- `docs/PROJECT_VISION.md` - product goals, long-term direction, and decision principles
- `docs/LOCAL_SETUP.md` - full local-only setup with local PostgreSQL and local app/socket services
- `docs/ARCHITECTURE.md` - technical architecture, data model, websocket flow, game engine patterns
- `docs/OPERATIONS.md` - environment setup, local runbook, deployment, troubleshooting
- `docs/ROADMAP.md` - active priorities and near-term milestones
- `docs/CONTRIBUTING.md` - workflow and engineering standards
- `docs/GAME_DEVELOPMENT.md` - source-of-truth rules and checklist for adding/promoting games
- `docs/SECURITY_MODEL.md` - auth boundaries, RLS posture, secrets policy
- `docs/REALTIME_TELEMETRY.md` - reconnect telemetry events, dashboards, SLOs, alerts
- `docs/DEPENDENCY_UPGRADE_PLAN.md` - staged dependency maintenance plan and migration sequencing
- `docs/PWA.md` - current PWA implementation and install/offline regression checks
- `docs/PERFORMANCE_BUNDLE_BUDGET.md` - bundle budget policy and measurement baselines
- `docs/OBSIDIAN_VAULT.md` - local Obsidian vault workflow and note-safety rules

## Specialized docs

- `lib/bots/README.md` - bot architecture and implementation guide
- `prisma/migrations/README.md` - migration timeline and RLS migration notes
- `public/sounds/README.md` - audio assets and usage notes
- `docs/ALIBI_NIGHT_DESIGN.md` - phase model, safety rules, and MVP checklist for upcoming Alibi Night game

## Root-level docs

- `README.md` - quick start and repo entry point
- `SECURITY.md` - vulnerability reporting policy
- `CODE_OF_CONDUCT.md` - community standards
- `.github/copilot-instructions.md` - AI-agent execution guide for this repo
- `.github/PULL_REQUEST_TEMPLATE.md` - PR checklist used by GitHub
- `.github/ISSUE_TEMPLATE/*.md` - issue templates used by GitHub
- `.vscode/README.md` - optional local MCP/tooling setup notes

## Historical archives

- `docs/superpowers/specs/**` and `docs/superpowers/plans/**` are historical planning artifacts.
- Use them for context only; do not treat them as current implementation instructions.
- Canonical behavior should be confirmed in the core docs, `prisma/schema.prisma`, package scripts, and source code.
- Archival docs can contain old URLs, old command snippets, and old roadmap assumptions.

## Documentation rules

- Keep docs short and source-of-truth oriented.
- Prefer one canonical page per topic instead of status snapshots.
- Remove or merge historical writeups once decisions are absorbed.
- Canonical docs should pass markdownlint; archival docs are excluded unless they are being actively refreshed.
