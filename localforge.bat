@echo off
setlocal
cd /d "%~dp0"
node out/cli.js %*
