Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mcp-common.ps1")

$workspaceDir = Get-WorkspaceDirFromScript -ScriptPath $PSCommandPath
Import-WorkspaceEnv -WorkspaceDir $workspaceDir

Assert-Command -CommandName "node" -InstallHint "Install Node.js and ensure it is available in your PATH."

$serverEntry = Join-Path $workspaceDir "node_modules\@modelcontextprotocol\server-filesystem\dist\index.js"
if (-not (Test-Path -LiteralPath $serverEntry)) {
  throw "Missing local MCP server entrypoint: $serverEntry. Run 'npm install' in the workspace."
}

& node $serverEntry $workspaceDir
exit $LASTEXITCODE
