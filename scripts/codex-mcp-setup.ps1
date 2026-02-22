param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandName,
    [Parameter(Mandatory = $true)]
    [string]$InstallHint
  )

  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "'$CommandName' command not found. $InstallHint"
  }
}

function Test-McpServerExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & codex mcp get $Name --json 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Add-OrUpdateMcpServer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string[]]$CommandArgs,
    [switch]$ForceReplace
  )

  $exists = Test-McpServerExists -Name $Name

  if ($exists -and -not $ForceReplace) {
    Write-Host "Skipping '$Name' (already configured)."
    return
  }

  if ($exists -and $ForceReplace) {
    Write-Host "Removing existing '$Name'..."
    & codex mcp remove $Name
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to remove MCP server '$Name'."
    }
  }

  Write-Host "Adding '$Name'..."
  $addArgs = @("mcp", "add", $Name, "--") + $CommandArgs
  & codex @addArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to add MCP server '$Name'."
  }
}

Assert-Command -CommandName "codex" -InstallHint "Install Codex CLI and ensure it is available in your PATH."
Assert-Command -CommandName "powershell" -InstallHint "Windows PowerShell is required."

$workspaceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$githubScript = (Join-Path $workspaceDir "scripts\mcp-github.ps1")
$postgresScript = (Join-Path $workspaceDir "scripts\mcp-postgres.ps1")
$filesystemScript = (Join-Path $workspaceDir "scripts\mcp-filesystem.ps1")
$memoryScript = (Join-Path $workspaceDir "scripts\mcp-memory.ps1")

if (-not (Test-Path -LiteralPath $githubScript)) {
  throw "Missing script: $githubScript"
}

if (-not (Test-Path -LiteralPath $postgresScript)) {
  throw "Missing script: $postgresScript"
}

if (-not (Test-Path -LiteralPath $filesystemScript)) {
  throw "Missing script: $filesystemScript"
}

if (-not (Test-Path -LiteralPath $memoryScript)) {
  throw "Missing script: $memoryScript"
}

$pwshBaseArgs = @("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File")

Add-OrUpdateMcpServer -Name "boardly-github" -CommandArgs ($pwshBaseArgs + @($githubScript)) -ForceReplace:$Force
Add-OrUpdateMcpServer -Name "boardly-postgres" -CommandArgs ($pwshBaseArgs + @($postgresScript)) -ForceReplace:$Force
Add-OrUpdateMcpServer -Name "boardly-filesystem" -CommandArgs ($pwshBaseArgs + @($filesystemScript)) -ForceReplace:$Force
Add-OrUpdateMcpServer -Name "boardly-memory" -CommandArgs ($pwshBaseArgs + @($memoryScript)) -ForceReplace:$Force

Write-Host ""
Write-Host "Configured MCP servers:"
& codex mcp list
if ($LASTEXITCODE -ne 0) {
  throw "Failed to list MCP servers."
}

Write-Host ""
Write-Host "External MCP template (manual setup):"
Write-Host (Join-Path $workspaceDir "docs\codex-mcp.external-template.toml")
