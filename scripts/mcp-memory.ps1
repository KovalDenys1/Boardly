Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mcp-common.ps1")

$workspaceDir = Get-WorkspaceDirFromScript -ScriptPath $PSCommandPath
Import-WorkspaceEnv -WorkspaceDir $workspaceDir

Assert-Command -CommandName "node" -InstallHint "Install Node.js and ensure it is available in your PATH."

$serverEntry = Join-Path $workspaceDir "node_modules\@modelcontextprotocol\server-memory\dist\index.js"
if (-not (Test-Path -LiteralPath $serverEntry)) {
  throw "Missing local MCP server entrypoint: $serverEntry. Run 'npm install' in the workspace."
}

$memoryDir = Join-Path $workspaceDir ".codex-local\memory"
$memoryFilePath = Join-Path $memoryDir "boardly-memory.jsonl"

if (-not (Test-Path -LiteralPath $memoryDir)) {
  New-Item -ItemType Directory -Path $memoryDir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $memoryFilePath)) {
  New-Item -ItemType File -Path $memoryFilePath -Force | Out-Null
}

[Environment]::SetEnvironmentVariable("MEMORY_FILE_PATH", $memoryFilePath, "Process")

& node $serverEntry
exit $LASTEXITCODE
