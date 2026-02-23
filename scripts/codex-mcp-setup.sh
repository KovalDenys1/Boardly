#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"

exec node --import tsx "${workspace_dir}/scripts/codex-mcp-setup.ts" "$@"
