#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

load_workspace_env "$workspace_dir"

require_command "node" "Install Node.js and ensure it is available in your PATH."
require_env_var "DATABASE_URL" "DATABASE_URL is not set. Add it to .env/.env.local or your shell environment."

server_entry="${workspace_dir}/node_modules/@modelcontextprotocol/server-postgres/dist/index.js"
if [[ ! -f "$server_entry" ]]; then
  echo "Missing local MCP server entrypoint: ${server_entry}. Run 'npm install' in the workspace." >&2
  exit 1
fi

database_url="${DATABASE_URL}"
ca_cert_path_raw="${MCP_POSTGRES_CA_CERT_PATH:-}"

if [[ -n "$ca_cert_path_raw" ]]; then
  resolved_ca_path="$(node - "$ca_cert_path_raw" "$workspace_dir" <<'NODE'
const fs = require('fs');
const path = require('path');

const [rawPath, workspaceDir] = process.argv.slice(2);
let fullPath = rawPath;

if (!path.isAbsolute(fullPath)) {
  fullPath = path.join(workspaceDir, fullPath);
}

if (!fs.existsSync(fullPath)) {
  console.error(`MCP_POSTGRES_CA_CERT_PATH does not exist: ${fullPath}`);
  process.exit(1);
}

process.stdout.write(fs.realpathSync(fullPath));
NODE
)"

  export NODE_EXTRA_CA_CERTS="$resolved_ca_path"
  export PGSSLROOTCERT="$resolved_ca_path"

  database_url="$(node - "$database_url" "$resolved_ca_path" <<'NODE'
const [rawUrl, resolvedCaPath] = process.argv.slice(2);
const u = new URL(rawUrl);

if (!u.searchParams.has('sslrootcert')) {
  u.searchParams.set('sslrootcert', resolvedCaPath);
}
u.searchParams.set('sslmode', 'verify-full');

process.stdout.write(u.toString());
NODE
)"
fi

exec node "$server_entry" "$database_url"
