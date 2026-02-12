#!/usr/bin/env bash
set -euo pipefail

load_workspace_env() {
  local workspace_dir="$1"
  local env_file="${workspace_dir}/.env"
  local env_local_file="${workspace_dir}/.env.local"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  if [[ -f "$env_local_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_local_file"
    set +a
  fi
}

require_env_var() {
  local key="$1"
  local message="$2"

  if [[ -z "${!key:-}" ]]; then
    echo "$message" >&2
    exit 1
  fi
}

require_command() {
  local cmd="$1"
  local install_hint="$2"

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "'$cmd' command not found. ${install_hint}" >&2
    exit 1
  fi
}
