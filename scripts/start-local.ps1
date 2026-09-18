param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'tmp'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Test-Endpoint([string]$Url) {
  try {
    return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200
  } catch {
    return $false
  }
}

foreach ($service in @(
  @{ Name = 'backend'; Port = 3001; Url = 'http://127.0.0.1:3001/api/v1/ready' },
  @{ Name = 'frontend'; Port = 3000; Url = 'http://localhost:3000/login' }
)) {
  if (Test-Endpoint $service.Url) { continue }
  $listener = Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c npm run dev:$($service.Name)" `
      -WorkingDirectory $projectRoot -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logDirectory "startup-$($service.Name).log") `
      -RedirectStandardError (Join-Path $logDirectory "startup-$($service.Name).err.log")
  }
  $deadline = (Get-Date).AddSeconds(180)
  while (-not (Test-Endpoint $service.Url)) {
    if ((Get-Date) -ge $deadline) {
      throw "O $($service.Name) nao respondeu na porta $($service.Port). Consulte os logs em $logDirectory."
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host 'Sistema pronto: http://localhost:3000'
if (-not $NoBrowser) { Start-Process 'http://localhost:3000' }
