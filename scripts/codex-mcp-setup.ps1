param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspaceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scriptPath = Join-Path $workspaceDir "scripts\codex-mcp-setup.ts"

$argsList = @("--import", "tsx", $scriptPath)
if ($Force) {
  $argsList += "--force"
}

& node @argsList
exit $LASTEXITCODE
