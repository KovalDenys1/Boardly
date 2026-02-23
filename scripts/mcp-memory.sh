#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

load_workspace_env "$workspace_dir"

require_command "node" "Install Node.js and ensure it is available in your PATH."

server_entry="${workspace_dir}/node_modules/@modelcontextprotocol/server-memory/dist/index.js"
if [[ ! -f "$server_entry" ]]; then
  echo "Missing local MCP server entrypoint: ${server_entry}. Run 'npm install' in the workspace." >&2
  exit 1
fi

memory_dir="${workspace_dir}/.codex-local/memory"
memory_file_path="${memory_dir}/boardly-memory.jsonl"

mkdir -p "$memory_dir"
touch "$memory_file_path"

export MEMORY_FILE_PATH="$memory_file_path"

exec node "$server_entry"
