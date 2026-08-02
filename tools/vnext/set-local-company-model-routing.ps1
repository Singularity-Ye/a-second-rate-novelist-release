param(
  [string]$LargeProvider = "company-router",
  [string]$LargeModel = "grok-4.5",
  [string]$LightProvider = "company-router",
  [string]$LightModel = "gemini-3.6-flash",
  [string]$ConfigPath
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

$privateDirectory = [IO.Path]::GetFullPath(
  (Join-Path $env:LOCALAPPDATA "a-second-rate-novelist")
)
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $privateDirectory "company-model.private.ps1"
}
$resolvedPath = [IO.Path]::GetFullPath($ConfigPath)
$directoryPrefix = $privateDirectory.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedPath.StartsWith($directoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "ConfigPath must stay inside the private local model directory"
}
if (-not [IO.File]::Exists($resolvedPath)) {
  throw "Private model configuration does not exist"
}

$settings = [ordered]@{
  MODEL_ROUTE_CREATIVE_LARGE_PROVIDER = Require-Value $LargeProvider "LargeProvider"
  MODEL_ROUTE_CREATIVE_LARGE_MODEL = Require-Value $LargeModel "LargeModel"
  MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER = Require-Value $LightProvider "LightProvider"
  MODEL_ROUTE_CREATIVE_LIGHT_MODEL = Require-Value $LightModel "LightModel"
}

$content = [IO.File]::ReadAllText($resolvedPath, [Text.Encoding]::UTF8)
foreach ($entry in $settings.GetEnumerator()) {
  $name = [string]$entry.Key
  $pattern = "(?m)^\s*\`$env:" + [Regex]::Escape($name) + "\s*=.*$"
  $matches = [Regex]::Matches($content, $pattern)
  if ($matches.Count -ne 1) {
    throw "Expected exactly one $name assignment in the private configuration"
  }
  $replacement = "`$env:$name=" + (Quote-PowerShellLiteral ([string]$entry.Value))
  $content = [Regex]::Replace($content, $pattern, $replacement)
}

$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($resolvedPath, $content, $utf8WithoutBom)

$principal = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $resolvedPath /inheritance:r /grant:r "${principal}:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to retain the private model configuration ACL" }

Write-Host "Private model routing updated without printing or replacing credentials." -ForegroundColor Green
Write-Host "Analysis route: $LargeProvider / $LargeModel"
Write-Host "Chat and writing route: $LightProvider / $LightModel"
