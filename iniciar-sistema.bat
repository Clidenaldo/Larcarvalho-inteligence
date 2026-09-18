@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Larcarvalho Intelligence
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo ===========================================
echo    Larcarvalho Intelligence - Inicializacao
echo ===========================================
echo.

REM ---------- Node/npm ----------
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] npm nao encontrado. Instale Node.js 24 ou superior.
  pause
  exit /b 1
)

REM ---------- Docker ----------
set "DOCKER=docker"
where docker >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" (
    set "DOCKER=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe"
  ) else (
    echo [ERRO] Docker nao encontrado. Instale e inicie o Docker Desktop.
    pause
    exit /b 1
  )
)

REM ---------- PostgreSQL ----------
echo [1/4] Iniciando o PostgreSQL...
"%DOCKER%" compose --env-file "%ROOT%.env" -f "%ROOT%docker\compose.yaml" --profile database up -d postgres
if errorlevel 1 (
  echo [ERRO] Falha ao iniciar o PostgreSQL. Confirme que o Docker Desktop esta rodando.
  pause
  exit /b 1
)

echo [2/4] Aguardando o banco de dados ficar pronto...
set /a DB_ATTEMPTS=0
:waitdb
"%DOCKER%" compose --env-file "%ROOT%.env" -f "%ROOT%docker\compose.yaml" --profile database exec -T postgres pg_isready -U larcarvalho -d larcarvalho >nul 2>nul
if not errorlevel 1 goto dbready
set /a DB_ATTEMPTS+=1
if %DB_ATTEMPTS% GEQ 60 (
  echo [ERRO] PostgreSQL nao ficou pronto em 120 segundos.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto waitdb

:dbready
echo        PostgreSQL pronto.

REM ---------- Migrations ----------
echo [3/4] Aplicando migracoes...
call npm run prisma:migrate:deploy
if errorlevel 1 (
  echo [ERRO] Falha ao aplicar as migracoes.
  pause
  exit /b 1
)

REM ---------- Servicos e navegador ----------
echo [4/4] Verificando frontend e backend...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-local.ps1"
if errorlevel 1 (
  echo [ERRO] Consulte os logs na pasta tmp.
  pause
  exit /b 1
)
echo Sistema pronto. Logs na pasta tmp.
exit /b 0
