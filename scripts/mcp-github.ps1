Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mcp-common.ps1")

$workspaceDir = Get-WorkspaceDirFromScript -ScriptPath $PSCommandPath
Import-WorkspaceEnv -WorkspaceDir $workspaceDir

Assert-Command -CommandName "npx.cmd" -InstallHint "Install Node.js and ensure it is available in your PATH."

$githubToken = [Environment]::GetEnvironmentVariable("GITHUB_PERSONAL_ACCESS_TOKEN", "Process")
if ([string]::IsNullOrWhiteSpace($githubToken)) {
  $githubToken = [Environment]::GetEnvironmentVariable("GITHUB_TOKEN", "Process")
}

if ([string]::IsNullOrWhiteSpace($githubToken)) {
  throw "Set GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN in .env/.env.local."
}

[Environment]::SetEnvironmentVariable("GITHUB_PERSONAL_ACCESS_TOKEN", $githubToken, "Process")

& npx.cmd -y "@modelcontextprotocol/server-github"
exit $LASTEXITCODE
