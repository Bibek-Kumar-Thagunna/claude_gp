param([switch]$ForceUpdate)

. (Join-Path $PSScriptRoot "Common.ps1")

try {
  Write-Host "GoPasal Tester" -ForegroundColor Magenta
  Write-Host "This window may remain open for a few minutes on the first start."
  Assert-Docker
  Initialize-TesterEnvironment

  Write-Step $(if ($ForceUpdate) { "Downloading the newest tested GoPasal version" } else { "Checking for GoPasal updates" })
  & docker compose --env-file $script:EnvFile -f $script:ComposeFile pull api customer seller admin rider
  if ($LASTEXITCODE -ne 0) {
    if ($ForceUpdate) {
      throw "The newest GoPasal version could not be downloaded. Check the internet connection and try Update-GoPasal again."
    }
    $requiredImages = @(
      "ghcr.io/bibek-kumar-thagunna/gopasal-tester-api:latest",
      "ghcr.io/bibek-kumar-thagunna/gopasal-tester-customer:latest",
      "ghcr.io/bibek-kumar-thagunna/gopasal-tester-seller:latest",
      "ghcr.io/bibek-kumar-thagunna/gopasal-tester-admin:latest",
      "ghcr.io/bibek-kumar-thagunna/gopasal-tester-rider:latest"
    )
    $missingImage = $false
    foreach ($image in $requiredImages) {
      & docker image inspect $image *> $null
      if ($LASTEXITCODE -ne 0) { $missingImage = $true }
    }
    if ($missingImage) {
      throw "The public GoPasal tester build could not be downloaded and no complete saved copy exists yet. Check the internet connection. If other sites work, ask the developer to confirm that GitHub Actions finished publishing the tester build, then run Update-GoPasal again."
    }
    Write-Warning "The update check failed, so the saved GoPasal version will be used."
  }

  Write-Step "Starting the local database"
  Invoke-Compose up -d postgres redis

  Write-Step "Applying safe database updates"
  Invoke-Compose run --rm migrate

  $seedMarker = Join-Path $script:StateDir "seeded"
  if (-not (Test-Path $seedMarker)) {
    Write-Step "Creating the initial tester accounts, shops, products, and orders"
    Invoke-Compose --profile tools run --rm seed
    Set-Content -Path $seedMarker -Value (Get-Date).ToString("o") -Encoding ascii
  }

  Write-Step "Starting GoPasal"
  Invoke-Compose up -d api customer seller admin rider

  Write-Step "Waiting for every application"
  Wait-ForUrl "API" "http://localhost:4000/api/v1/health/ready"
  Wait-ForUrl "Customer" "http://localhost:3000"
  Wait-ForUrl "Seller" "http://localhost:3001/login"
  Wait-ForUrl "Admin" "http://localhost:3002/login"
  Wait-ForUrl "Rider" "http://localhost:3003/login"

  Write-Host "`nGoPasal is ready." -ForegroundColor Green
  Start-Process (Join-Path $script:TesterRoot "GoPasal-Tester.html")
} catch {
  Write-Host "`nCould not start GoPasal: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
