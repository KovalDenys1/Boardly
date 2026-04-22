# Obsidian Vault Workflow

Boardly can be opened directly as an Obsidian vault. This is optional local tooling; GitHub Issues, PRs, source files, and the canonical Markdown docs remain the project source of truth.

## Recommended setup

1. Open the repository root (`Boardly/`) as an Obsidian vault.
2. Keep Obsidian workspace metadata local. The root `.obsidian/` folder is ignored by git.
3. If you want private working notes inside the workspace, put them under `notes-local/`. That folder is also ignored by git.
4. Use standard Markdown links in committed docs, for example `[Architecture](ARCHITECTURE.md)`. Avoid Obsidian-only wikilinks in files that will be committed.

## Source of truth

Use committed Markdown for durable project knowledge:

- `README.md` for entry-point setup and repository map.
- `docs/README.md` for documentation navigation.
- `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, and `docs/SECURITY_MODEL.md` for canonical technical behavior.
- GitHub Issues/Projects for active task tracking.

Use private Obsidian notes for:

- rough investigations
- meeting notes
- personal checklists
- idea capture before a ticket exists

When a private note becomes a real decision, move the durable part into a canonical doc or a GitHub issue.

## Linking and organization

- Prefer relative Markdown links for committed docs so links work in GitHub and Obsidian.
- Keep broad navigation in `docs/README.md`.
- Keep implementation plans in GitHub issues or PR descriptions unless they need to become long-term reference material.
- Treat `docs/superpowers/**` as historical archive material, not current source-of-truth documentation.

## Safety rules

- Do not store secrets, tokens, env values, database dumps, or private user data in Obsidian notes.
- Do not commit `.obsidian/`, `.trash/`, or `notes-local/`.
- Before committing docs, run `git status --short` and make sure only intentional files are staged.
- If a committed Markdown file changes, keep it valid GitHub Markdown and run markdownlint when practical.
