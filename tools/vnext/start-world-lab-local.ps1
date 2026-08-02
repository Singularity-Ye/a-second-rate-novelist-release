param(
  [string]$PrivateEnvFile = "$env:LOCALAPPDATA\a-second-rate-novelist\company-model.private.ps1",
  [string]$DistillationProgressFile = "",
  [int]$H5Port = 3000,
  [int]$BackendPort = 4000,
  [int]$AdapterPort = 4317
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backend = Join-Path $repo "apps\backend"
$h5 = Join-Path $repo "apps\h5"
$tsx = Join-Path $repo "node_modules\.bin\tsx.CMD"
$prisma = Join-Path $backend "node_modules\.bin\prisma.CMD"
$next = Join-Path $h5 "node_modules\.bin\next.CMD"
$logDirectory = Join-Path $repo ".tmp\world-lab-dev"
$resolvedDistillationProgressFile = $null

if (-not (Test-Path -LiteralPath $PrivateEnvFile -PathType Leaf)) {
  throw "Private environment file is missing. Run tools/vnext/update-local-company-model-env.ps1 first."
}
if (-not (Test-Path -LiteralPath $tsx -PathType Leaf) -or -not (Test-Path -LiteralPath $prisma -PathType Leaf) -or -not (Test-Path -LiteralPath $next -PathType Leaf)) {
  throw "Workspace dependencies are missing. Install them before starting World Lab."
}
if (-not [string]::IsNullOrWhiteSpace($DistillationProgressFile)) {
  if (-not (Test-Path -LiteralPath $DistillationProgressFile -PathType Leaf)) {
    throw "Distillation progress file does not exist."
  }
  $resolvedDistillationProgressFile = (Resolve-Path -LiteralPath $DistillationProgressFile).Path
}
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

# pnpm may leave the generated client absent when dependency build scripts are
# blocked. Generate it from the already-installed Prisma CLI before booting the
# backend; this does not install packages or expose any private environment value.
& $prisma generate --schema (Join-Path $backend "prisma\schema.prisma") | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Prisma Client generation failed; inspect the installed workspace dependencies before starting World Lab."
}

function Test-ListeningPort([int]$Port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-PrivatePowerShellProcess([string]$Name, [string]$Body) {
  $command = ". '$PrivateEnvFile'; $Body"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  Start-Process powershell.exe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded) `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory "$Name.stdout.log") `
    -RedirectStandardError (Join-Path $logDirectory "$Name.stderr.log") | Out-Null
}

function ConvertTo-SingleQuotedPowerShellLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

if (-not (Test-ListeningPort $AdapterPort)) {
  Start-PrivatePowerShellProcess "route-adapter" "Set-Location -LiteralPath '$backend'; & '$tsx' 'src/vnext/infrastructure/local-trusted-route-adapter-main.ts'"
}

if (-not (Test-ListeningPort $BackendPort)) {
  Start-PrivatePowerShellProcess "backend" "`$env:PORT='$BackendPort'; `$env:VNEXT_WORLD_LAB_INTERNAL_TEST_MODE='true'; Set-Location -LiteralPath '$backend'; & '$tsx' 'src/main.ts'"
}

if (-not (Test-ListeningPort $H5Port)) {
  $h5Literal = ConvertTo-SingleQuotedPowerShellLiteral $h5
  $nextLiteral = ConvertTo-SingleQuotedPowerShellLiteral $next
  $progressSetup = "Remove-Item Env:VNEXT_LOCAL_DISTILLATION_PROGRESS_FILE -ErrorAction SilentlyContinue"
  if ($null -ne $resolvedDistillationProgressFile) {
    $progressLiteral = ConvertTo-SingleQuotedPowerShellLiteral $resolvedDistillationProgressFile
    $progressSetup = "`$env:VNEXT_LOCAL_DISTILLATION_PROGRESS_FILE=$progressLiteral"
  }
  $h5Command = "$progressSetup; Set-Location -LiteralPath $h5Literal; & $nextLiteral dev -H 127.0.0.1 -p $H5Port"
  $h5EncodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($h5Command))
  Start-Process powershell.exe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $h5EncodedCommand) `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory "h5.stdout.log") `
    -RedirectStandardError (Join-Path $logDirectory "h5.stderr.log") | Out-Null
}

$deadline = (Get-Date).AddSeconds(40)
do {
  Start-Sleep -Milliseconds 500
  $adapterReady = Test-ListeningPort $AdapterPort
  $backendReady = Test-ListeningPort $BackendPort
  $h5Ready = Test-ListeningPort $H5Port
} while ((-not $adapterReady -or -not $backendReady -or -not $h5Ready) -and (Get-Date) -lt $deadline)

if (-not $adapterReady -or -not $backendReady -or -not $h5Ready) {
  throw "World Lab startup timed out. adapter=$adapterReady backend=$backendReady h5=$h5Ready; inspect .tmp/world-lab-dev logs."
}

$backendStatus = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$BackendPort/healthz" -TimeoutSec 8).StatusCode
$h5Status = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$H5Port/vnext/world-lab" -TimeoutSec 12).StatusCode
if ($backendStatus -ne 200 -or $h5Status -ne 200) {
  throw "World Lab HTTP readiness failed. backend=$backendStatus h5=$h5Status"
}

Write-Output "World Lab ready: H5=http://127.0.0.1:$H5Port/vnext/world-lab backend=$backendStatus adapter=127.0.0.1:$AdapterPort"
