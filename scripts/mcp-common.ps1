Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()

    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      continue
    }

    if ($trimmed.StartsWith("#")) {
      continue
    }

    if ($trimmed -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      continue
    }

    $name = $matches[1]
    $value = $matches[2]

    if (
      ($value.Length -ge 2) -and (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      )
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Import-WorkspaceEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceDir
  )

  Import-DotEnvFile -Path (Join-Path $WorkspaceDir ".env")
  Import-DotEnvFile -Path (Join-Path $WorkspaceDir ".env.local")
}

function Require-EnvVar {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw $Message
  }
}

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

function Get-WorkspaceDirFromScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath
  )

  return (Resolve-Path (Join-Path (Split-Path -Parent $ScriptPath) "..")).Path
}
