#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

load_workspace_env "$workspace_dir"

require_command "npx" "Install Node.js and ensure it is available in your PATH."
require_env_var "DATABASE_URL" "DATABASE_URL is not set. Add it to .env/.env.local or your shell environment."

exec npx -y @modelcontextprotocol/server-postgres "$DATABASE_URL"
