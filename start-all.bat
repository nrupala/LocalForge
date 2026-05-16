@echo off
setlocal
cd /d "%~dp0"

echo =======================================
echo  LocalForge - Launch All
echo =======================================
echo.

:: Check if opencode is available
where opencode >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [✓] opencode found
) else (
    echo [!] opencode not installed - only local models available
)

:: Start llama-server if GGUF file exists
if exist "D:\LocalForge\qwen2.5-coder-7b-instruct-q4_k_m.gguf" (
    echo [*] Starting llama.cpp server...
    powershell -NoProfile -ExecutionPolicy Bypass -File "D:\LocalForge\start-server.ps1"
) else (
    echo [!] No GGUF model found - set LOCALFORGE_PROVIDER=opencode or LOCALFORGE_PROVIDER=openai
)

echo [*] Starting LocalForge Web UI...
start http://127.0.0.1:3096
node out/server.js

pause
