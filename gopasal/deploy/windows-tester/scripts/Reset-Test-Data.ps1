. (Join-Path $PSScriptRoot "Common.ps1")

try {
  Assert-Docker
  Initialize-TesterEnvironment
  Write-Host "This permanently removes every local GoPasal test order, account, upload, and message." -ForegroundColor Yellow
  $answer = Read-Host "Type RESET to continue"
  if ($answer -cne "RESET") {
    Write-Host "Nothing was changed."
    exit 0
  }
  Write-Step "Removing only GoPasal Tester data"
  Invoke-Compose down --volumes --remove-orphans
  $seedMarker = Join-Path $script:StateDir "seeded"
  if (Test-Path $seedMarker) { Remove-Item -LiteralPath $seedMarker -Force }
  Write-Host "`nTest data was reset. Start GoPasal to create a fresh baseline." -ForegroundColor Green
} catch {
  Write-Host "`nCould not reset GoPasal: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
