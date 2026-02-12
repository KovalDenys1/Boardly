#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

load_workspace_env "$workspace_dir"

require_command "npx" "Install Node.js and ensure it is available in your PATH."

if [[ -n "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]]; then
  export GITHUB_PERSONAL_ACCESS_TOKEN
elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
  export GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_TOKEN"
else
  echo "Set GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN in .env/.env.local." >&2
  exit 1
fi

exec npx -y @modelcontextprotocol/server-github
