param(
  [string]$ModelName = "D:\LocalForge\qwen2.5-coder-7b-instruct-q4_k_m.gguf",
  [int]$Port = 11434,
  [int]$GPULayers = 99
)

$serverExe = "D:\LocalForge\llama-server.exe"

if (-not (Test-Path -LiteralPath $serverExe)) {
  Write-Error "llama-server.exe not found at $serverExe"
  Write-Output "Download from: https://github.com/ggml-org/llama.cpp/releases"
  exit 1
}

if (-not (Test-Path -LiteralPath $ModelName)) {
  Write-Warning "Model not found at $ModelName"
  Write-Output "Place your GGUF model file at: $ModelName"
  Write-Output "Or download from HuggingFace (e.g., Qwen/Qwen2.5-Coder-7B-Instruct-GGUF)"
  exit 1
}

Get-Process -Name llama-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Write-Output "Starting llama-server with:"
Write-Output "  Model: $ModelName"
Write-Output "  Port:  $Port"
Write-Output "  GPU:   $GPULayers layers"

Start-Process -FilePath $serverExe -ArgumentList @(
  "-m", $ModelName,
  "--host", "127.0.0.1",
  "--port", $Port,
  "--jinja",
  "-c", "2048",
  "-ngl", $GPULayers,
  "--no-kv-offload",
  "--chat-template", "chatml",
  "-t", "8",
  "-tb", "8",
  "--mlock"
) -WindowStyle Hidden -PassThru -RedirectStandardOutput "D:\LocalForge\llama-server-out.log" -RedirectStandardError "D:\LocalForge\llama-server-err.log"

Start-Sleep -Seconds 2

if (Get-Process -Name llama-server -ErrorAction SilentlyContinue) {
  Write-Output "llama-server running on http://127.0.0.1:$Port (PID: $(Get-Process -Name llama-server -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id))"
} else {
  Write-Error "llama-server failed to start. Check logs:"
  Get-Content "D:\LocalForge\llama-server-err.log" -Tail 10 -ErrorAction SilentlyContinue
}
