# LocalForge Test Suite
# Run: pwsh .\scripts\test-all.ps1

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $root
$global:testPassed = 0; $global:testFailed = 0; $global:testTotal = 0

function Test-Step($name, $scriptBlock) {
  $global:testTotal++
  try {
    $r = & $scriptBlock
    Write-Host "  ✓ $name" -ForegroundColor Green
    $global:testPassed++
  } catch {
    Write-Host "  ✗ $name : $_" -ForegroundColor Red
    $global:testFailed++
  }
}

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    LocalForge Test Suite             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. TypeScript Compile ──
Write-Host "── [1] TypeScript Compile ──" -ForegroundColor Yellow
Test-Step "tsc --noEmit" { npx tsc --noEmit 2>&1 }
Test-Step "tsc build" { npx tsc 2>&1 }

# ── 2. Media Assets ──
Write-Host "`n── [2] Media Assets ──" -ForegroundColor Yellow
Test-Step "icon.png exists" { Test-Path icon.png }
Test-Step "media/logo.svg exists" { Test-Path media/logo.svg }
Test-Step "media/favicon.svg exists" { Test-Path media/favicon.svg }
Test-Step "docs/icon.png exists" { Test-Path docs/icon.png }
Test-Step "docs/favicon.png exists" { Test-Path docs/favicon.png }

# ── 3. CLI - Demo Mode ──
Write-Host "`n── [3] CLI Demo Mode ──" -ForegroundColor Yellow

$env:LOCALFORGE_DEMO = "1"

Test-Step "cli run 'hello'" {
  $r = node out/cli.js run "hello" 2>$null
  if ("$r" -notmatch "LocalForge") { throw "No expected content" }
}
Test-Step "cli plan" {
  $r = node out/cli.js plan "add validation" 2>$null
  $j = $r | ConvertFrom-Json -ErrorAction Stop
  if ($j.Count -lt 1) { throw "Expected at least 1 plan step" }
}
Test-Step "cli workflow" {
  $r = node out/cli.js workflow "test" 2>$null
  if ("$r" -notmatch "completed" -and "$r" -notmatch "failed") { throw "No workflow result" }
}

# ── 4. Web UI Server ──
Write-Host "`n── [4] Web UI Server ──" -ForegroundColor Yellow

$env:LOCALFORGE_PORT = "3099"
$server = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "out/server.js" -PassThru
Start-Sleep -Seconds 2

try {
  Test-Step "server health" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/api/health" -UseBasicParsing -TimeoutSec 5
    $j = $r.Content | ConvertFrom-Json
    if ($j.status -ne "ok") { throw "Health check failed" }
  }
  Test-Step "server chat" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/api/chat" -Method POST -Body '{"message":"hello","mode":"chat"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
    if ([string]::IsNullOrWhiteSpace($r.Content)) { throw "Empty response" }
  }
  Test-Step "server workflow" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/api/workflow" -Method POST -Body '{"goal":"add validation"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 15
    $j = $r.Content | ConvertFrom-Json
    if ($j.success -ne $true) { throw "Workflow failed" }
  }
  Test-Step "server config" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/api/config" -UseBasicParsing -TimeoutSec 5
    $j = $r.Content | ConvertFrom-Json
    if (!$j.type) { throw "No config returned" }
  }
  Test-Step "server provider switch" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/api/provider" -Method POST -Body '{"type":"demo"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
    $j = $r.Content | ConvertFrom-Json
    if ($j.type -ne "demo") { throw "Provider switch failed" }
  }
  Test-Step "server homepage" {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/" -UseBasicParsing -TimeoutSec 5
    if (!$r.Content.Contains("LocalForge")) { throw "No expected content" }
  }
  Test-Step "server 404" {
    try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:3099/nonexistent" -UseBasicParsing -TimeoutSec 3 }
    catch { if ($_.Exception.Response.StatusCode -ne 404) { throw "Expected 404" } }
  }
} finally {
  $server.Kill()
}

# ── 5. GitHub Pages Site ──
Write-Host "`n── [5] GitHub Pages Site ──" -ForegroundColor Yellow
Test-Step "docs/index.html exists" { Test-Path docs/index.html }
Test-Step "docs/index.html has OG tags" { (Get-Content docs/index.html -Raw).Contains("og:title") }
Test-Step "docs/index.html has pricing" { (Get-Content docs/index.html -Raw).Contains('$14') }
Test-Step "docs/index.html has support link" { (Get-Content docs/index.html -Raw).Contains("buymeacoffee.com/nrupalakolt") }

# ── 6. License & Legal ──
Write-Host "`n── [6] License & Legal ──" -ForegroundColor Yellow
$license = Get-Content LICENSE -Raw
Test-Step "LICENSE: Nrupal Akolkar" { $license.Contains("Nrupal Akolkar") }
Test-Step "LICENSE: Proudly Made in Canada" { $license.Contains("Made in Canada") }
Test-Step "LICENSE: AGPL v3" { $license.Contains("AGPL") }

# ── 7. Package Integrity ──
Write-Host "`n── [7] Package Integrity ──" -ForegroundColor Yellow
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
Test-Step "package.json: publisher nrupala" { $pkg.publisher -eq "nrupala" }
Test-Step "package.json: has icon" { $pkg.icon -eq "icon.png" }
Test-Step "package.json: has repository" { $pkg.repository.url -contains "nrupala" }

# ── 8. Feature Files ──
Write-Host "`n── [8] Feature Files ──" -ForegroundColor Yellow
Test-Step "README.md exists" { Test-Path README.md }
Test-Step "CONTRIBUTING.md exists" { Test-Path CONTRIBUTING.md }
Test-Step "DEMO-SCRIPT.md exists" { Test-Path DEMO-SCRIPT.md }
Test-Step "demo-cli.ps1 exists" { Test-Path demo-cli.ps1 }
Test-Step "generate-demo-video.bat exists" { Test-Path generate-demo-video.bat }
Test-Step "GitHub CI exists" { Test-Path .github/workflows/ci.yml }
Test-Step "Issue templates exist" { (Get-ChildItem .github/ISSUE_TEMPLATE/*.yml).Count -ge 2 }

# ── Summary ──
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Results: $global:testPassed/$global:testTotal passed" -ForegroundColor $(if ($global:testFailed -eq 0) {"Green"} else {"Yellow"})
if ($global:testFailed -gt 0) { Write-Host "║  $global:testFailed test(s) FAILED" -ForegroundColor Red }
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
if ($global:testFailed -gt 0) { exit 1 }
