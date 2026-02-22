param(
  [int]$StartupTimeoutSeconds = 3
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

function Assert-CodexMcpEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  & codex mcp get $Name --json 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Missing Codex MCP entry: $Name"
  }
}

function Test-McpScriptLiveness {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,
    [int]$TimeoutSeconds = 3
  )

  Write-Host ""
  Write-Host "==> Liveness: $Name"

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $proc = $null

  try {
    $proc = Start-Process -FilePath "powershell" -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $ScriptPath
    ) -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    Start-Sleep -Milliseconds ([Math]::Max(500, $TimeoutSeconds * 1000))

    if (-not $proc.HasExited) {
      Write-Host "    OK (process is running on stdio)"
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      return
    }

    $stdoutRaw = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }
    $stderrRaw = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { "" }
    $stdout = if ($null -eq $stdoutRaw) { "" } else { $stdoutRaw.Trim() }
    $stderr = if ($null -eq $stderrRaw) { "" } else { $stderrRaw.Trim() }
    $combinedOutput = @($stdout, $stderr) -join "`n"

    if ($combinedOutput -match '(?i)running on stdio') {
      Write-Host "    OK (startup banner detected; stdio server exited after stdin closed)"
      if ($stdout) { Write-Host "    stdout: $stdout" }
      if ($stderr) { Write-Host "    stderr: $stderr" }
      return
    }

    if ((($null -eq $proc.ExitCode) -or ($proc.ExitCode -eq 0)) -and [string]::IsNullOrWhiteSpace($stderr)) {
      if ($stdout) {
        Write-Host "    OK (started and exited cleanly; stdin likely closed)"
        Write-Host "    stdout: $stdout"
      }
      else {
        Write-Host "    OK (exited cleanly; stdio server likely stopped after stdin closed)"
      }
      return
    }

    Write-Host "    FAIL (exited with code $($proc.ExitCode))"
    if ($stdout) {
      Write-Host "    stdout: $stdout"
    }
    if ($stderr) {
      Write-Host "    stderr: $stderr"
    }

    throw "MCP liveness check failed for $Name"
  }
  finally {
    if ($proc -and -not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $stdoutPath) { Remove-Item $stdoutPath -Force -ErrorAction SilentlyContinue }
    if (Test-Path $stderrPath) { Remove-Item $stderrPath -Force -ErrorAction SilentlyContinue }
  }
}

function Invoke-PostgresDriverSmoke {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceDir
  )

  $smokeScript = Join-Path $WorkspaceDir "scripts\test-mcp-postgres-driver.ps1"
  if (-not (Test-Path -LiteralPath $smokeScript)) {
    throw "Missing Postgres driver smoke script: $smokeScript"
  }

  Write-Host ""
  Write-Host "==> Postgres driver smoke (same pg stack as MCP server)"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $smokeScript 1>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Postgres driver smoke failed."
  }
  Write-Host "    OK"
}

Assert-Command -CommandName "codex" -InstallHint "Install Codex CLI and ensure it is available in your PATH."
Assert-Command -CommandName "powershell" -InstallHint "Windows PowerShell is required."

$workspaceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$expectedEntries = @(
  "boardly-github",
  "boardly-postgres",
  "boardly-filesystem",
  "boardly-memory"
)

Write-Host "Boardly MCP Health Check"
Write-Host "Workspace: $workspaceDir"

Write-Host ""
Write-Host "==> Codex MCP list"
& codex mcp list
if ($LASTEXITCODE -ne 0) {
  throw "Failed to list Codex MCP servers."
}

Write-Host ""
Write-Host "==> Codex MCP registrations"
foreach ($entry in $expectedEntries) {
  Assert-CodexMcpEntry -Name $entry
  Write-Host "    OK $entry"
}

Test-McpScriptLiveness -Name "boardly-github" -ScriptPath (Join-Path $workspaceDir "scripts\mcp-github.ps1") -TimeoutSeconds $StartupTimeoutSeconds
Test-McpScriptLiveness -Name "boardly-postgres" -ScriptPath (Join-Path $workspaceDir "scripts\mcp-postgres.ps1") -TimeoutSeconds $StartupTimeoutSeconds
Test-McpScriptLiveness -Name "boardly-filesystem" -ScriptPath (Join-Path $workspaceDir "scripts\mcp-filesystem.ps1") -TimeoutSeconds $StartupTimeoutSeconds
Test-McpScriptLiveness -Name "boardly-memory" -ScriptPath (Join-Path $workspaceDir "scripts\mcp-memory.ps1") -TimeoutSeconds $StartupTimeoutSeconds
Invoke-PostgresDriverSmoke -WorkspaceDir $workspaceDir

$memoryFilePath = Join-Path $workspaceDir ".codex-local\memory\boardly-memory.jsonl"
Write-Host ""
Write-Host "==> Memory file path"
if (-not (Test-Path -LiteralPath $memoryFilePath)) {
  throw "Memory file not found: $memoryFilePath"
}
Write-Host "    OK $memoryFilePath"

Write-Host ""
Write-Host "Health check completed (registrations + liveness + Postgres TLS/query smoke)."
Write-Host "Tip: If a live Codex session still shows old Postgres TLS errors, restart the session to reload the MCP process."
