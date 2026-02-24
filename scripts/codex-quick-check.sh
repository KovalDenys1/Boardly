#!/usr/bin/env bash
set -euo pipefail

skip_env=0
skip_db=0
skip_tests=0
full_tests=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-env)
      skip_env=1
      shift
      ;;
    --skip-db)
      skip_db=1
      shift
      ;;
    --skip-tests)
      skip_tests=1
      shift
      ;;
    --full-tests)
      full_tests=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--skip-env] [--skip-db] [--skip-tests] [--full-tests]" >&2
      exit 1
      ;;
  esac
done

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

require_command "npm" "Install Node.js and ensure npm is available in your PATH."

invoke_step() {
  local name="$1"
  shift
  local command="$1"
  shift
  local args=("$@")

  echo
  echo "==> $name"
  echo "    ${command} ${args[*]}"

  local started_at
  started_at="$(date +%s)"
  "$command" "${args[@]}"
  local elapsed
  elapsed="$(( $(date +%s) - started_at ))"
  echo "    OK (${elapsed}s)"
}

get_existing_smoke_tests() {
  local candidates=(
    "__tests__/lib/socket-url.test.ts"
    "__tests__/lib/guest-helpers.test.ts"
    "__tests__/lib/game-registry.test.ts"
    "__tests__/lib/lobby-player-requirements.test.ts"
  )

  local test_path
  for test_path in "${candidates[@]}"; do
    if [[ -f "${workspace_dir}/${test_path}" ]]; then
      printf '%s\n' "$test_path"
    fi
  done
}

echo "Boardly Codex Quick Check"
echo "Workspace: $workspace_dir"

pushd "$workspace_dir" >/dev/null
trap 'popd >/dev/null' EXIT

if [[ "$skip_env" -eq 0 ]]; then
  invoke_step "Environment check (quiet values)" npm run check:env:quiet
else
  echo
  echo "==> Environment check (quiet values)"
  echo "    Skipped (--skip-env)."
fi

if [[ "$skip_db" -eq 0 ]]; then
  invoke_step "Database connectivity check" npm run check:db
else
  echo
  echo "==> Database connectivity check"
  echo "    Skipped (--skip-db)."
fi

invoke_step "Lint + typecheck (ci:quick)" npm run ci:quick

if [[ "$skip_tests" -eq 0 ]]; then
  if [[ "$full_tests" -eq 1 ]]; then
    invoke_step "Full test suite" npm test
  else
    smoke_tests=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && smoke_tests+=("$line")
    done < <(get_existing_smoke_tests)

    if [[ "${#smoke_tests[@]}" -eq 0 ]]; then
      echo
      echo "==> Jest smoke tests"
      echo "    No configured smoke test files found; skipping."
    else
      invoke_step "Jest smoke tests" npm test -- --runTestsByPath "${smoke_tests[@]}"
    fi
  fi
else
  echo
  echo "==> Tests"
  echo "    Skipped (--skip-tests)."
fi

echo
echo "Quick check completed successfully."
