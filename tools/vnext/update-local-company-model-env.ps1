param(
  [string]$BaseUrl,
  [string]$Provider = "company-router",
  [string]$Model = "grok-4.5",
  [string]$LightModel = "gemini-3.6-flash",
  [string]$ImageModel = "gpt-image-2",
  [int]$Port = 4317,
  [Security.SecureString]$ApiKey
)

$ErrorActionPreference = "Stop"

function Require-Value([string]$Value, [string]$Label) {
  $trimmed = $Value.Trim()
  if ($trimmed.Length -eq 0) { throw "$Label must not be empty" }
  return $trimmed
}

function Quote-PowerShellLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = Read-Host "Company OpenAI-compatible Base URL (HTTPS)"
}
$BaseUrl = Require-Value $BaseUrl "BaseUrl"
$Provider = Require-Value $Provider "Provider"
$Model = Require-Value $Model "Model"
$LightModel = Require-Value $LightModel "LightModel"
$ImageModel = Require-Value $ImageModel "ImageModel"

$uri = [Uri]$BaseUrl
if ($uri.Scheme -ne "https" -or -not [string]::IsNullOrEmpty($uri.UserInfo)) {
  throw "BaseUrl must be a credential-free HTTPS URL"
}
if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535" }

$secureKey = $ApiKey
if ($null -eq $secureKey) {
  $secureKey = Read-Host "Rotated company API Key (hidden)" -AsSecureString
}
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$plainKey = $null
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plainKey)) { throw "API Key must not be empty" }

  $tokenBytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($tokenBytes)
    $localToken = ($tokenBytes | ForEach-Object { $_.ToString("x2") }) -join ""
  } finally {
    $rng.Dispose()
    [Array]::Clear($tokenBytes, 0, $tokenBytes.Length)
  }
  $directory = Join-Path $env:LOCALAPPDATA "a-second-rate-novelist"
  $file = Join-Path $directory "company-model.private.ps1"
  [IO.Directory]::CreateDirectory($directory) | Out-Null

  $lines = @(
    "# Internal local-provider test only. Never commit, upload, screenshot, or ship this file."
    "`$env:VNEXT_UPSTREAM_BASE_URL=$(Quote-PowerShellLiteral $BaseUrl)"
    "`$env:VNEXT_UPSTREAM_API_KEY=$(Quote-PowerShellLiteral $plainKey)"
    "`$env:VNEXT_LOCAL_ROUTE_ADAPTER_TOKEN=$(Quote-PowerShellLiteral $localToken)"
    "`$env:VNEXT_LOCAL_ROUTE_ADAPTER_PORT=$(Quote-PowerShellLiteral ([string]$Port))"
    "`$env:VNEXT_LOCAL_ROUTE_ADAPTER_TIMEOUT_MS='170000'"
    "`$env:LITELLM_BASE_URL=$(Quote-PowerShellLiteral "http://127.0.0.1:$Port/v1")"
    "`$env:LITELLM_API_KEY=$(Quote-PowerShellLiteral $localToken)"
    "`$env:MODEL_ROUTE_CREATIVE_LARGE_PROVIDER=$(Quote-PowerShellLiteral $Provider)"
    "`$env:MODEL_ROUTE_CREATIVE_LARGE_MODEL=$(Quote-PowerShellLiteral $Model)"
    "`$env:MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER=$(Quote-PowerShellLiteral $Provider)"
    "`$env:MODEL_ROUTE_CREATIVE_LIGHT_MODEL=$(Quote-PowerShellLiteral $LightModel)"
    "`$env:MODEL_ROUTE_IMAGE_PROVIDER=$(Quote-PowerShellLiteral $Provider)"
    "`$env:MODEL_ROUTE_IMAGE_MODEL=$(Quote-PowerShellLiteral $ImageModel)"
    "`$env:VNEXT_CREATIVE_TIMEOUT_MS='180000'"
    "`$env:VNEXT_GATEWAY_ROUTE_ATTESTATION_VERSION='v1'"
  )
  $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($file, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, $utf8WithoutBom)

  $principal = "$env:USERDOMAIN\$env:USERNAME"
  & icacls.exe $directory /inheritance:r /grant:r "${principal}:(OI)(CI)(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to restrict the private directory ACL" }
  & icacls.exe $file /inheritance:r /grant:r "${principal}:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to restrict the private env ACL" }

  Write-Host "Private model environment updated." -ForegroundColor Green
  Write-Host "Path: $file"
  Write-Host "Analysis route: $Provider / $Model"
  Write-Host "Chat and writing route: $Provider / $LightModel"
  Write-Host "Loopback adapter: http://127.0.0.1:$Port"
  Write-Host "No secret value was printed. Load it with: . '$file'"
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  $plainKey = $null
  $secureKey = $null
}
