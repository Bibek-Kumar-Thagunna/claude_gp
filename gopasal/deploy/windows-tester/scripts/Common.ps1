$ErrorActionPreference = "Stop"
$script:TesterRoot = Split-Path -Parent $PSScriptRoot
$script:ComposeFile = Join-Path $script:TesterRoot "compose.yml"
$script:StateDir = Join-Path $script:TesterRoot ".state"
$script:EnvFile = Join-Path $script:TesterRoot ".env"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/ and try again."
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is installed but not running. Open Docker Desktop, wait until it says Engine running, and try again."
  }
  docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose is unavailable. Update Docker Desktop and try again."
  }
}

function New-HexSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  } finally {
    $generator.Dispose()
  }
  return ([System.BitConverter]::ToString($buffer)).Replace("-", "").ToLowerInvariant()
}

function Initialize-TesterEnvironment {
  New-Item -ItemType Directory -Force -Path $script:StateDir | Out-Null
  if (Test-Path $script:EnvFile) { return }
  $databasePassword = New-HexSecret 24
  $accessSecret = New-HexSecret 32
  $refreshSecret = New-HexSecret 32
  @"
GOPASAL_DB_PASSWORD=$databasePassword
GOPASAL_JWT_ACCESS_SECRET=$accessSecret
GOPASAL_JWT_REFRESH_SECRET=$refreshSecret
GOPASAL_IMAGE_TAG=latest
"@ | Set-Content -Path $script:EnvFile -Encoding ascii
}

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & docker compose --env-file $script:EnvFile -f $script:ComposeFile @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker could not complete the requested GoPasal operation."
  }
}

function Wait-ForUrl([string]$Name, [string]$Url, [int]$Seconds = 180) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Host "  Ready: $Name" -ForegroundColor Green
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)
  throw "$Name did not become ready within $Seconds seconds. Run Export-Diagnostics and send the ZIP to the developer."
}
