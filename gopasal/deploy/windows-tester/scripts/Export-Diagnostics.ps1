. (Join-Path $PSScriptRoot "Common.ps1")

try {
  Assert-Docker
  Initialize-TesterEnvironment
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $exportRoot = Join-Path $script:TesterRoot "exports"
  $work = Join-Path $exportRoot "GoPasal-$stamp"
  New-Item -ItemType Directory -Force -Path $work | Out-Null

  Write-Step "Collecting service status and recent logs"
  (& docker compose --env-file $script:EnvFile -f $script:ComposeFile ps 2>&1 | Out-String) |
    Set-Content -Path (Join-Path $work "service-status.txt") -Encoding utf8
  (& docker compose --env-file $script:EnvFile -f $script:ComposeFile logs --no-color --tail 500 2>&1 | Out-String) |
    Set-Content -Path (Join-Path $work "recent-logs.txt") -Encoding utf8
  (& docker version 2>&1 | Out-String) |
    Set-Content -Path (Join-Path $work "docker-version.txt") -Encoding utf8

  $postgresId = (& docker compose --env-file $script:EnvFile -f $script:ComposeFile ps -q postgres).Trim()
  if ($postgresId) {
    Write-Step "Exporting the shared test database"
    & docker exec $postgresId pg_dump -U gopasal -d gopasal --format=custom --file=/tmp/gopasal-tester.dump
    if ($LASTEXITCODE -eq 0) {
      & docker cp "${postgresId}:/tmp/gopasal-tester.dump" (Join-Path $work "gopasal-tester.dump")
      & docker exec $postgresId sh -c "rm -f /tmp/gopasal-tester.dump" | Out-Null
    }
  }

  @"
This archive contains local test logs and a database copy. It can include test
names, phone numbers, orders, messages, OTP log lines, and uploaded test files.
Send it only to the GoPasal developer through a private channel.
"@ | Set-Content -Path (Join-Path $work "PRIVACY-NOTE.txt") -Encoding utf8

  $zip = Join-Path $exportRoot "GoPasal-Diagnostics-$stamp.zip"
  Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zip -Force
  Write-Host "`nCreated: $zip" -ForegroundColor Green
  Start-Process explorer.exe -ArgumentList "/select,`"$zip`""
} catch {
  Write-Host "`nCould not export diagnostics: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
