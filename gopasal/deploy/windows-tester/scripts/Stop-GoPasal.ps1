. (Join-Path $PSScriptRoot "Common.ps1")

try {
  Assert-Docker
  Initialize-TesterEnvironment
  Write-Step "Stopping GoPasal while preserving all test data"
  Invoke-Compose stop
  Write-Host "`nGoPasal is stopped. Your test data is safe." -ForegroundColor Green
} catch {
  Write-Host "`nCould not stop GoPasal: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
