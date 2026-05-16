@echo off
setlocal
cd /d "%~dp0"
echo Starting LocalForge Web UI...
echo Provider: %LOCALFORGE_PROVIDER% (default: local)
echo Endpoint: %LOCALFORGE_ENDPOINT% (default: http://127.0.0.1:11434/v1)
echo.
node out/server.js
