param(
  [switch]$SkipEnv,
  [switch]$SkipDb,
  [switch]$SkipTests,
  [switch]$FullTests
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

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @()
  )

  Write-Host ""
  Write-Host "==> $Name"
  $commandPreview = (@($Command) + $Arguments) -join " "
  Write-Host ("    " + $commandPreview)

  $startedAt = Get-Date
  & $Command @Arguments
  $exitCode = $LASTEXITCODE
  $elapsed = (Get-Date) - $startedAt

  if ($exitCode -ne 0) {
    throw "Step '$Name' failed with exit code $exitCode."
  }

  Write-Host ("    OK ({0:N1}s)" -f $elapsed.TotalSeconds)
}

function Get-ExistingSmokeTests {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceDir
  )

  $candidates = @(
    "__tests__/lib/socket-url.test.ts",
    "__tests__/lib/guest-helpers.test.ts",
    "__tests__/lib/game-registry.test.ts",
    "__tests__/lib/lobby-player-requirements.test.ts"
  )

  $existing = @()
  foreach ($testPath in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $WorkspaceDir $testPath)) {
      $existing += $testPath
    }
  }

  return $existing
}

Assert-Command -CommandName "npm.cmd" -InstallHint "Install Node.js and ensure npm is available in your PATH."

$workspaceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$npm = "npm.cmd"

Write-Host "Boardly Codex Quick Check"
Write-Host "Workspace: $workspaceDir"

Push-Location $workspaceDir
try {
  if (-not $SkipEnv) {
    Invoke-Step -Name "Environment check (quiet values)" -Command $npm -Arguments @("run", "check:env:quiet")
  }
  else {
    Write-Host ""
    Write-Host "==> Environment check (quiet values)"
    Write-Host "    Skipped (-SkipEnv)."
  }

  if (-not $SkipDb) {
    Invoke-Step -Name "Database connectivity check" -Command $npm -Arguments @("run", "check:db")
  }
  else {
    Write-Host ""
    Write-Host "==> Database connectivity check"
    Write-Host "    Skipped (-SkipDb)."
  }

  Invoke-Step -Name "Lint + typecheck (ci:quick)" -Command $npm -Arguments @("run", "ci:quick")

  if (-not $SkipTests) {
    if ($FullTests) {
      Invoke-Step -Name "Full test suite" -Command $npm -Arguments @("test")
    }
    else {
      $smokeTests = Get-ExistingSmokeTests -WorkspaceDir $workspaceDir
      if ($smokeTests.Count -eq 0) {
        Write-Host ""
        Write-Host "==> Jest smoke tests"
        Write-Host "    No configured smoke test files found; skipping."
      }
      else {
        Invoke-Step -Name "Jest smoke tests" -Command $npm -Arguments (@("test", "--", "--runTestsByPath") + $smokeTests)
      }
    }
  }
  else {
    Write-Host ""
    Write-Host "==> Tests"
    Write-Host "    Skipped (-SkipTests)."
  }

  Write-Host ""
  Write-Host "Quick check completed successfully."
}
finally {
  Pop-Location
}
