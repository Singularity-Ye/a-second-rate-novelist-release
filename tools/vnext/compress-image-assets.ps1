param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [int]$MaxEdge = 1774,
  [int]$Quality = 72,
  [int]$MaxKB = 100,
  [int]$MinEdge = 256
)

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw 'python is required; Pillow must be available in the active environment.' }

& $python.Source (Join-Path $PSScriptRoot 'compress-image-assets.py') `
  --input $InputPath `
  --output-dir $OutputDirectory `
  --max-edge $MaxEdge `
  --quality $Quality `
  --max-kb $MaxKB `
  --min-edge $MinEdge
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
