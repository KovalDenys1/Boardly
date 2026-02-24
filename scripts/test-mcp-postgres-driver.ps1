param(
  [string]$Sql = "select current_database() as database, current_user as db_user"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mcp-common.ps1")

$workspaceDir = Get-WorkspaceDirFromScript -ScriptPath $PSCommandPath
Import-WorkspaceEnv -WorkspaceDir $workspaceDir

Assert-Command -CommandName "node" -InstallHint "Install Node.js and ensure it is available in your PATH."
Require-EnvVar -Name "DATABASE_URL" -Message "DATABASE_URL is not set in .env/.env.local."
Require-EnvVar -Name "MCP_POSTGRES_CA_CERT_PATH" -Message "MCP_POSTGRES_CA_CERT_PATH is not set in .env/.env.local."

$dbUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
$caPath = [Environment]::GetEnvironmentVariable("MCP_POSTGRES_CA_CERT_PATH", "Process")

if (-not [System.IO.Path]::IsPathRooted($caPath)) {
  $caPath = Join-Path $workspaceDir $caPath
}

if (-not (Test-Path -LiteralPath $caPath)) {
  throw "CA file not found: $caPath"
}

$caPath = (Resolve-Path -LiteralPath $caPath).Path
$pgCandidates = @(
  (Join-Path $workspaceDir "node_modules\@modelcontextprotocol\server-postgres\node_modules\pg"),
  (Join-Path $workspaceDir "node_modules\pg")
)

$pgModulePath = $pgCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pgModulePath) {
  throw "Cannot find pg driver (checked: $($pgCandidates -join ', '))"
}

[Environment]::SetEnvironmentVariable("NODE_EXTRA_CA_CERTS", $caPath, "Process")
[Environment]::SetEnvironmentVariable("PGSSLROOTCERT", $caPath, "Process")

$caPathForUrl = ($caPath -replace '\\', '/')
$caPathEncoded = [System.Uri]::EscapeDataString($caPathForUrl)
$dbUrlWithCa = $dbUrl
if ($dbUrlWithCa -notmatch '([?&])sslrootcert=') {
  $separator = if ($dbUrlWithCa.Contains("?")) { "&" } else { "?" }
  $dbUrlWithCa = $dbUrlWithCa + $separator + "sslrootcert=" + $caPathEncoded
}
if ($dbUrlWithCa -match '([?&])sslmode=') {
  $sslModeRegex = New-Object System.Text.RegularExpressions.Regex("(?i)([?&]sslmode=)[^&]*")
  $dbUrlWithCa = $sslModeRegex.Replace($dbUrlWithCa, '$1verify-full', 1)
}
else {
  $separator = if ($dbUrlWithCa.Contains("?")) { "&" } else { "?" }
  $dbUrlWithCa = $dbUrlWithCa + $separator + "sslmode=verify-full"
}

[Environment]::SetEnvironmentVariable("DATABASE_URL", $dbUrlWithCa, "Process")

$env:NODE_EXTRA_CA_CERTS = $caPath
$env:PGSSLROOTCERT = $caPath
$env:DATABASE_URL = $dbUrlWithCa
$env:PG_MCP_SMOKE_SQL = $Sql
$env:PG_MCP_SMOKE_PG_MODULE_PATH = $pgModulePath

$nodeScript = @'
const pg = require(process.env.PG_MCP_SMOKE_PG_MODULE_PATH || "pg");

(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(process.env.PG_MCP_SMOKE_SQL || "select 1 as ok");
    console.log(JSON.stringify({ ok: true, rowCount: result.rowCount, firstRow: result.rows[0] ?? null }));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
'@

$tmpScript = Join-Path ([System.IO.Path]::GetTempPath()) ("boardly-pg-mcp-smoke-" + [Guid]::NewGuid().ToString("N") + ".cjs")

try {
  Set-Content -LiteralPath $tmpScript -Value $nodeScript -NoNewline
  & node $tmpScript
  if ($LASTEXITCODE -ne 0) {
    throw "Postgres driver smoke test failed."
  }
}
finally {
  if (Test-Path -LiteralPath $tmpScript) {
    Remove-Item -LiteralPath $tmpScript -Force -ErrorAction SilentlyContinue
  }
}
