param(
  [int]$StartupTimeoutSeconds = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspaceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scriptPath = Join-Path $workspaceDir "scripts\codex-mcp-health-check.ts"

$argsList = @("--import", "tsx", $scriptPath, "--startup-timeout-seconds", $StartupTimeoutSeconds.ToString())

& node @argsList
exit $LASTEXITCODE
