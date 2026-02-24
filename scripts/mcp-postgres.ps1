Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mcp-common.ps1")

$workspaceDir = Get-WorkspaceDirFromScript -ScriptPath $PSCommandPath
Import-WorkspaceEnv -WorkspaceDir $workspaceDir

Assert-Command -CommandName "node" -InstallHint "Install Node.js and ensure it is available in your PATH."
Require-EnvVar -Name "DATABASE_URL" -Message "DATABASE_URL is not set. Add it to .env/.env.local or your shell environment."

$databaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
$caCertPathRaw = [Environment]::GetEnvironmentVariable("MCP_POSTGRES_CA_CERT_PATH", "Process")
$serverEntry = Join-Path $workspaceDir "node_modules\@modelcontextprotocol\server-postgres\dist\index.js"

if (-not (Test-Path -LiteralPath $serverEntry)) {
  throw "Missing local MCP server entrypoint: $serverEntry. Run 'npm install' in the workspace."
}

if (-not [string]::IsNullOrWhiteSpace($caCertPathRaw)) {
  $caCertPath = $caCertPathRaw
  if (-not [System.IO.Path]::IsPathRooted($caCertPath)) {
    $caCertPath = Join-Path $workspaceDir $caCertPath
  }

  if (-not (Test-Path -LiteralPath $caCertPath)) {
    throw "MCP_POSTGRES_CA_CERT_PATH does not exist: $caCertPath"
  }

  $resolvedCaPath = (Resolve-Path -LiteralPath $caCertPath).Path
  [Environment]::SetEnvironmentVariable("NODE_EXTRA_CA_CERTS", $resolvedCaPath, "Process")
  [Environment]::SetEnvironmentVariable("PGSSLROOTCERT", $resolvedCaPath, "Process")

  $caPathForUrl = ($resolvedCaPath -replace '\\', '/')
  $caPathEncoded = [System.Uri]::EscapeDataString($caPathForUrl)

  if ($databaseUrl -notmatch '([?&])sslrootcert=') {
    $separator = if ($databaseUrl.Contains("?")) { "&" } else { "?" }
    $databaseUrl = $databaseUrl + $separator + "sslrootcert=" + $caPathEncoded
  }

  if ($databaseUrl -match '([?&])sslmode=') {
    $sslModeRegex = New-Object System.Text.RegularExpressions.Regex("(?i)([?&]sslmode=)[^&]*")
    $databaseUrl = $sslModeRegex.Replace($databaseUrl, '$1verify-full', 1)
  }
  else {
    $separator = if ($databaseUrl.Contains("?")) { "&" } else { "?" }
    $databaseUrl = $databaseUrl + $separator + "sslmode=verify-full"
  }
}

& node $serverEntry $databaseUrl
exit $LASTEXITCODE
