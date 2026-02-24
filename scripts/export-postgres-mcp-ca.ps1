param(
  [string]$OutputRelativePath = ".codex-local/certs/postgres-mcp-ca.cer",
  [ValidateSet(".env", ".env.local")]
  [string]$EnvFileName = ".env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "mcp-common.ps1")

function Get-DatabaseEndpoint {
  param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceDir
  )

  Import-WorkspaceEnv -WorkspaceDir $WorkspaceDir
  Require-EnvVar -Name "DATABASE_URL" -Message "DATABASE_URL is not set in .env/.env.local."

  $databaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
  $uri = [System.Uri]$databaseUrl

  return [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  }
}

function Get-PostgresTlsChain {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ServerHost,
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $script:capturedChain = $null
  $script:capturedChainCertificates = @()
  $script:capturedRemoteCertificate = $null
  $tcp = $null
  $stream = $null
  $ssl = $null

  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.ReceiveTimeout = 10000
    $tcp.SendTimeout = 10000
    $tcp.Connect($ServerHost, $Port)

    $stream = $tcp.GetStream()
    $stream.ReadTimeout = 10000
    $stream.WriteTimeout = 10000

    # PostgreSQL SSLRequest message:
    # Int32 length = 8, Int32 code = 80877103 (0x04D2162F)
    [byte[]]$sslRequest = @(0, 0, 0, 8, 4, 210, 22, 47)
    $stream.Write($sslRequest, 0, $sslRequest.Length)
    $stream.Flush()

    $responseByte = $stream.ReadByte()
    if ($responseByte -lt 0) {
      throw "No response from Postgres server during SSL negotiation."
    }

    if ($responseByte -ne [byte][char]'S') {
      $asChar = [char][byte]$responseByte
      throw "Postgres server rejected SSL negotiation (response '$asChar')."
    }

    $callback = [System.Net.Security.RemoteCertificateValidationCallback]{
      param($sender, $certificate, $chain, $sslPolicyErrors)
      $script:capturedChain = $chain
      $script:capturedRemoteCertificate = $certificate
      $script:capturedChainCertificates = @()
      if ($null -ne $chain -and $null -ne $chain.ChainElements) {
        foreach ($element in @($chain.ChainElements)) {
          if ($null -ne $element -and $null -ne $element.Certificate) {
            $script:capturedChainCertificates += (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($element.Certificate))
          }
        }
      }
      return $true
    }

    $ssl = New-Object System.Net.Security.SslStream($stream, $false, $callback)
    $ssl.AuthenticateAsClient($ServerHost)

    if ($script:capturedChainCertificates.Count -gt 0) {
      return @($script:capturedChainCertificates)
    }

    if ($null -eq $ssl.RemoteCertificate -and $null -eq $script:capturedRemoteCertificate) {
      throw "Could not capture remote TLS certificate from Postgres connection."
    }

    $remoteCertBase = if ($null -ne $ssl.RemoteCertificate) { $ssl.RemoteCertificate } else { $script:capturedRemoteCertificate }
    $remoteCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($remoteCertBase)
    $rebuiltChain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    $rebuiltChain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    [void]$rebuiltChain.Build($remoteCert)

    $rebuiltChainCertificates = @()
    if ($null -ne $rebuiltChain.ChainElements) {
      foreach ($element in @($rebuiltChain.ChainElements)) {
        if ($null -ne $element -and $null -ne $element.Certificate) {
          $rebuiltChainCertificates += (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($element.Certificate))
        }
      }
    }

    if ($rebuiltChainCertificates.Count -gt 0) {
      return @($rebuiltChainCertificates)
    }

    return @($remoteCert)
  }
  finally {
    if ($ssl) { $ssl.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($tcp) { $tcp.Dispose() }
  }
}

function Convert-CertToPem {
  param(
    [Parameter(Mandatory = $true)]
    [System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
  )

  $bytes = $Certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
  $base64 = [Convert]::ToBase64String(
    $bytes,
    [System.Base64FormattingOptions]::InsertLineBreaks
  )

  return @(
    "-----BEGIN CERTIFICATE-----"
    $base64
    "-----END CERTIFICATE-----"
  ) -join "`n"
}

function Get-CaCertificatesFromChainCertificates {
  param(
    [Parameter(Mandatory = $true)]
    [System.Security.Cryptography.X509Certificates.X509Certificate2[]]$ChainCertificates
  )

  $certificates = @($ChainCertificates)
  if ($certificates.Count -eq 0) {
    throw "TLS chain is empty."
  }

  # Certificates are expected to be ordered leaf -> intermediates -> root.
  # Export CA bundle excluding the leaf certificate.
  $startIndex = if ($certificates.Count -gt 1) { 1 } else { 0 }

  $seen = @{}
  $result = New-Object System.Collections.Generic.List[System.Security.Cryptography.X509Certificates.X509Certificate2]
  for ($i = $startIndex; $i -lt $certificates.Count; $i++) {
    $cert = $certificates[$i]
    if ($null -eq $cert) {
      continue
    }

    $thumbprint = $cert.Thumbprint
    if (-not $seen.ContainsKey($thumbprint)) {
      $seen[$thumbprint] = $true
      [void]$result.Add($cert)
    }
  }

  if ($result.Count -eq 0) {
    throw "No CA certificates found in captured TLS chain."
  }

  return @($result)
}

function Set-OrAddEnvVarInFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "Env file not found: $FilePath"
  }

  $content = Get-Content -LiteralPath $FilePath -Raw
  $line = "$Name=$Value"
  $pattern = "(?m)^\s*" + [Regex]::Escape($Name) + "\s*=.*$"

  if ([Regex]::IsMatch($content, $pattern)) {
    $updated = [Regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line }, 1)
  } else {
    $needsNewline = $content.Length -gt 0 -and -not ($content.EndsWith("`r`n") -or $content.EndsWith("`n"))
    $updated = $content + ($(if ($needsNewline) { "`r`n" } else { "" })) + $line + "`r`n"
  }

  Set-Content -LiteralPath $FilePath -Value $updated -NoNewline
}

$workspaceDir = Get-WorkspaceDirFromScript -ScriptPath $PSCommandPath
$endpoint = Get-DatabaseEndpoint -WorkspaceDir $workspaceDir

Write-Host "Exporting Postgres MCP CA bundle"
Write-Host "Host: $($endpoint.Host)"
Write-Host "Port: $($endpoint.Port)"

$chainCertificates = @(Get-PostgresTlsChain -ServerHost $endpoint.Host -Port $endpoint.Port)
$caCertificates = @(Get-CaCertificatesFromChainCertificates -ChainCertificates $chainCertificates)

$outputPath = $OutputRelativePath
if (-not [System.IO.Path]::IsPathRooted($outputPath)) {
  $outputPath = Join-Path $workspaceDir $outputPath
}

$outputDir = Split-Path -Parent $outputPath
if (-not (Test-Path -LiteralPath $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$pemBlocks = @()
foreach ($cert in $caCertificates) {
  $pemBlocks += Convert-CertToPem -Certificate $cert
}

$pemText = ($pemBlocks -join "`n") + "`n"
Set-Content -LiteralPath $outputPath -Value $pemText -NoNewline

$envFilePath = Join-Path $workspaceDir $EnvFileName
$relativeForEnv = if ([System.IO.Path]::IsPathRooted($OutputRelativePath)) {
  $OutputRelativePath
} else {
  ($OutputRelativePath -replace '\\', '/')
}

Set-OrAddEnvVarInFile -FilePath $envFilePath -Name "MCP_POSTGRES_CA_CERT_PATH" -Value $relativeForEnv

Write-Host ""
Write-Host "CA bundle exported:"
Write-Host "  $outputPath"
Write-Host "Included CA certificates: $($caCertificates.Count)"

Write-Host ""
Write-Host "Updated env file:"
Write-Host "  $envFilePath"
Write-Host "  MCP_POSTGRES_CA_CERT_PATH=$relativeForEnv"
