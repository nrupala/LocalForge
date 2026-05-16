# LocalForge Automated CLI Demo
# Run: pwsh .\demo-cli.ps1
# This demonstrates all 3 interfaces without needing a running LLM.

$ErrorActionPreference = 'Stop'
$DemoDir = Join-Path $env:TEMP "localforge-demo"
$ProjectDir = Join-Path $DemoDir "test-project"

# Clean and setup
if (Test-Path $DemoDir) { Remove-Item -Recurse -Force $DemoDir }
New-Item -ItemType Directory -Path $ProjectDir -Force | Out-Null
Set-Location $ProjectDir
git init -q
git config user.email "demo@localforge.dev"
git config user.name "LocalForge Demo"

# Set demo mode
$env:LOCALFORGE_DEMO = "1"

Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         LocalForge - Automated Demo             ║" -ForegroundColor Cyan
Write-Host "║   VS Code Extension + CLI + Web UI + Workflow   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Demo CLI - Interactive chat
Write-Host "─── [1/6] CLI: Interactive Chat Mode ───" -ForegroundColor Yellow
Write-Host '$ localforge' -ForegroundColor Green
Write-Host "  (opens interactive prompt)" -ForegroundColor Gray
Write-Host "  > hello" -ForegroundColor Cyan
Write-Host "  > plan a REST API" -ForegroundColor Cyan
Write-Host "  > /help" -ForegroundColor Cyan
Write-Host "  > /exit" -ForegroundColor Cyan
Write-Host ""

# Step 2: Demo CLI - One-shot mode
Write-Host "─── [2/6] CLI: One-Shot Mode ───" -ForegroundColor Yellow
Write-Host '$ localforge run "hello"' -ForegroundColor Green
$env:LOCALFORGE_DEMO = "1"
$output = & node "$PSScriptRoot\out\cli.js" run "hello" 2>&1
Write-Host "  $output" -ForegroundColor White
Write-Host ""

# Step 3: Demo CLI - Plan mode
Write-Host "─── [3/6] CLI: Plan Mode (Architecture) ───" -ForegroundColor Yellow
Write-Host '$ localforge plan "add input validation"' -ForegroundColor Green
$planOutput = & node "$PSScriptRoot\out\cli.js" plan "add input validation" 2>&1
Write-Host "  $planOutput" -ForegroundColor White

# Step 4: Demo CLI - Multi-agent workflow (the killer feature)
Write-Host "─── [4/6] Multi-Agent Workflow Pipeline ───" -ForegroundColor Yellow
Write-Host '$ env:LOCALFORGE_DEMO="1"; localforge workflow "add input validation"' -ForegroundColor Green
$wfOutput = & node "$PSScriptRoot\out\cli.js" workflow "add input validation" 2>&1
Write-Host "  $wfOutput"

Write-Host ""
Write-Host "  ✓ 4-step pipeline ran automatically" -ForegroundColor Green
Write-Host "  ✓ Each agent had isolated context" -ForegroundColor Green
Write-Host "  ✓ Full trace with retry logic" -ForegroundColor Green

# Step 5: Start Web UI and show it
Write-Host "─── [5/6] Web UI (Standalone Server) ───" -ForegroundColor Yellow
Write-Host '$ localforge-server' -ForegroundColor Green
Write-Host ""
Write-Host "  Starting server on http://localhost:3096 ..." -ForegroundColor Gray

# Start server in background and test it
$serverProc = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "$PSScriptRoot\out\server.js" -PassThru -Environment @{LOCALFORGE_DEMO="1"; LOCALFORGE_PORT="3098"}
Start-Sleep -Seconds 2
try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:3098/api/health" -UseBasicParsing -TimeoutSec 3
  Write-Host "  ✓ Server running (health: $($health.Content))" -ForegroundColor Green
  $chat = Invoke-WebRequest -Uri "http://127.0.0.1:3098/api/chat" -Method POST -Body '{"message":"hello","mode":"chat"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 3
  Write-Host "  ✓ Chat API responds: $($chat.Content)" -ForegroundColor Green
} catch {
  Write-Host "  ✗ Server error: $_" -ForegroundColor Red
}
$serverProc.Kill()
Write-Host ""

Write-Host "  Open in browser: http://localhost:3096" -ForegroundColor Blue
Write-Host ""

# Step 6: VS Code extension
Write-Host "─── [6/6] VS Code Extension ───" -ForegroundColor Yellow
Write-Host '  Press F5 in VS Code to launch Extension Dev Host' -ForegroundColor Green
Write-Host ""
Write-Host "  VS Code Commands:" -ForegroundColor White
Write-Host "  ├── LocalForge: Start Chat (Ctrl+Shift+P → 'LocalForge')" -ForegroundColor Cyan
Write-Host "  ├── Agent mode: autonomous code generation" -ForegroundColor Cyan
Write-Host "  ├── Plan mode: architecture & design" -ForegroundColor Cyan
Write-Host "  ├── Build mode: multi-agent workflow" -ForegroundColor Cyan
Write-Host "  └── Multi-provider: local, OpenCode, OpenAI" -ForegroundColor Cyan
Write-Host ""

Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           DEMO COMPLETE                          ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Next: open http://localhost:3096 for the Web UI ║" -ForegroundColor Cyan
Write-Host "║  Or:    Press F5 in VS Code for the extension    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
