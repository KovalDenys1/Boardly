#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
env_file="${workspace_dir}/.env"

# Load workspace env file for MCP servers started by VS Code.
if [[ -f "$env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Add it to .env or your shell environment." >&2
  exit 1
fi

exec npx -y @modelcontextprotocol/server-postgres "$DATABASE_URL"
