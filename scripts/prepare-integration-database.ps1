$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw 'Create the local .env file before preparing the integration database.'
}

$environment = @{}

foreach ($line in Get-Content -LiteralPath $environmentPath) {
  $trimmed = $line.Trim()

  if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
    continue
  }

  $key, $value = $trimmed.Split('=', 2)
  $environment[$key] = $value
}

$testDatabaseUrl = $environment['TEST_DATABASE_URL']

if (-not $testDatabaseUrl) {
  throw 'TEST_DATABASE_URL is required in the local .env file.'
}

$parsedUrl = [uri]$testDatabaseUrl
$databaseName = $parsedUrl.AbsolutePath.TrimStart('/')
$databaseUser = $parsedUrl.UserInfo.Split(':', 2)[0]

if (
  $parsedUrl.Host -notin @('127.0.0.1', 'localhost') -or
  $databaseName -ne 'larcarvalho_test' -or
  $databaseUser -notmatch '^[a-zA-Z0-9_]+$'
) {
  throw 'TEST_DATABASE_URL must target the local larcarvalho_test database.'
}

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerCommand) {
  $docker = $dockerCommand.Source
} else {
  $docker = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
}

if (-not (Test-Path -LiteralPath $docker)) {
  throw 'Docker CLI was not found.'
}

$composeArguments = @(
  'compose',
  '--env-file',
  (Join-Path $projectRoot '.env'),
  '-f',
  (Join-Path $projectRoot 'docker\compose.yaml'),
  '--profile',
  'database'
)

& $docker @composeArguments up -d postgres
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to start the integration PostgreSQL container.'
}

$existingDatabase = @(
  & $docker @composeArguments exec -T postgres psql -U $databaseUser -d postgres -tAc "SELECT datname FROM pg_database WHERE datname='$databaseName'"
) -join ''
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to query the integration database catalog.'
}

if ($existingDatabase.Trim() -ne $databaseName) {
  & $docker @composeArguments exec -T postgres createdb -U $databaseUser $databaseName
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create the integration database.'
  }
}

Push-Location $projectRoot
$previousDatabaseUrl = $env:DATABASE_URL

try {
  $env:DATABASE_URL = $testDatabaseUrl
  npm run prisma:migrate:test:deploy
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to apply integration database migrations.'
  }
} finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }

  Pop-Location
}
