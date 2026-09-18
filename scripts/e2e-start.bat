@echo off
setlocal
cd /d "%~dp0.."
call npm run e2e -- %*
exit /b %errorlevel%
