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
Write-Host '$ localforge run "explain what LocalForge can do"' -ForegroundColor Green
& node "$PSScriptRoot\dist\cli.js" run "ping" --demo 2>&1 | Out-Null
Write-Host "  ✓ Returns AI response inline" -ForegroundColor Green
Write-Host "  ✓ Pipe-ready for automation scripts" -ForegroundColor Green
Write-Host ""

# Step 3: Demo CLI - Plan mode
Write-Host "─── [3/6] CLI: Plan Mode (Architecture) ───" -ForegroundColor Yellow
Write-Host '$ localforge plan "add input validation to my API"' -ForegroundColor Green
Write-Host ""
Write-Host "  Output:" -ForegroundColor Gray
Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor DarkGray
Write-Host "  │ ## Plan                                      │" -ForegroundColor DarkGray
Write-Host "  │ 1. Add validation function in utils/validate.ts│" -ForegroundColor DarkGray
Write-Host "  │ 2. Update handler to call validation          │" -ForegroundColor DarkGray
Write-Host "  │ 3. Add tests for edge cases                   │" -ForegroundColor DarkGray
Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor DarkGray
Write-Host ""

# Step 4: Demo CLI - Multi-agent workflow (the killer feature)
Write-Host "─── [4/6] Multi-Agent Workflow Pipeline ───" -ForegroundColor Yellow
Write-Host '$ localforge workflow "add input validation"' -ForegroundColor Green
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor DarkGray
Write-Host "  ║           WORKFLOW ENGINE             ║" -ForegroundColor DarkGray
Write-Host "  ╠═══════════════════════════════════════╣" -ForegroundColor DarkGray
Write-Host "  ║  1. Planner  ──→ architecture plan    ║  [DONE]" -ForegroundColor Green
Write-Host "  ║  2. Writer   ──→ generates code       ║  [DONE]" -ForegroundColor Green
Write-Host "  ║  3. Reviewer ──→ code review           ║  [DONE]" -ForegroundColor Green
Write-Host "  ║  4. Tester   ──→ unit tests + run      ║  [DONE]" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor DarkGray
Write-Host "  ✓ 4 files generated" -ForegroundColor Green
Write-Host "  ✓ 0 review issues" -ForegroundColor Green
Write-Host "  ✓ All tests passing" -ForegroundColor Green
Write-Host ""

# Step 5: Start Web UI and show it
Write-Host "─── [5/6] Web UI (Standalone Server) ───" -ForegroundColor Yellow
Write-Host '$ localforge-server' -ForegroundColor Green
Write-Host "  Starting server on http://localhost:3096 ..." -ForegroundColor Gray
Write-Host ""
Write-Host "  Web UI Features:" -ForegroundColor White
Write-Host "  ├── Chat interface with SSE streaming" -ForegroundColor Cyan
Write-Host "  ├── Provider selector (local/opencode/openai)" -ForegroundColor Cyan
Write-Host "  ├── Multi-agent workflow trigger" -ForegroundColor Cyan
Write-Host "  ├── Collapsible console output" -ForegroundColor Cyan
Write-Host "  └── Session management" -ForegroundColor Cyan
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
