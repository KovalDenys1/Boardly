#!/usr/bin/env bash
set -euo pipefail

sql="${1:-select current_database() as database, current_user as db_user}"

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "${workspace_dir}/scripts/mcp-common.sh"

load_workspace_env "$workspace_dir"

require_command "node" "Install Node.js and ensure it is available in your PATH."
require_env_var "DATABASE_URL" "DATABASE_URL is not set in .env/.env.local."

db_url="${DATABASE_URL}"
ca_path="${MCP_POSTGRES_CA_CERT_PATH:-}"

pg_module_path=""
pg_candidates=(
  "${workspace_dir}/node_modules/@modelcontextprotocol/server-postgres/node_modules/pg"
  "${workspace_dir}/node_modules/pg"
)

for candidate in "${pg_candidates[@]}"; do
  if [[ -d "$candidate" ]]; then
    pg_module_path="$candidate"
    break
  fi
done

if [[ -z "$pg_module_path" ]]; then
  echo "Cannot find pg driver (checked: ${pg_candidates[*]})" >&2
  exit 1
fi

if [[ -n "$ca_path" ]]; then
  resolved_ca_path="$(node - "$ca_path" "$workspace_dir" <<'NODE'
const fs = require('fs');
const path = require('path');

const [rawPath, workspaceDir] = process.argv.slice(2);
let fullPath = rawPath;

if (!path.isAbsolute(fullPath)) {
  fullPath = path.join(workspaceDir, fullPath);
}

if (!fs.existsSync(fullPath)) {
  console.error(`CA file not found: ${fullPath}`);
  process.exit(1);
}

process.stdout.write(fs.realpathSync(fullPath));
NODE
)"

  export NODE_EXTRA_CA_CERTS="$resolved_ca_path"
  export PGSSLROOTCERT="$resolved_ca_path"

  db_url="$(node - "$db_url" "$resolved_ca_path" <<'NODE'
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

export DATABASE_URL="$db_url"
export PG_MCP_SMOKE_SQL="$sql"
export PG_MCP_SMOKE_PG_MODULE_PATH="$pg_module_path"

node - <<'NODE'
const pg = require(process.env.PG_MCP_SMOKE_PG_MODULE_PATH || 'pg');

(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(process.env.PG_MCP_SMOKE_SQL || 'select 1 as ok');
    console.log(JSON.stringify({
      ok: true,
      rowCount: result.rowCount,
      firstRow: result.rows[0] ?? null,
    }));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
NODE
