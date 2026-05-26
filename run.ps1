param(
    [string]$TunnelBaseUrl = "",
    [string]$OpenClawBaseUrl = "",
    [string]$TunnelApiKey = "",
    [string]$OpenClawApiKey = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    py -m venv .venv
}

.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

if (-not (Test-Path "config.toml")) {
    Copy-Item "config.example.toml" "config.toml"
}

if (-not $TunnelBaseUrl -and $OpenClawBaseUrl) {
    $TunnelBaseUrl = $OpenClawBaseUrl
}

if (-not $TunnelApiKey -and $OpenClawApiKey) {
    $TunnelApiKey = $OpenClawApiKey
}

if ($TunnelBaseUrl) {
    $env:TUNNEL_BASE_URL = $TunnelBaseUrl
    $env:OPENCLAW_BASE_URL = $TunnelBaseUrl
}

if ($TunnelApiKey) {
    $env:TUNNEL_API_KEY = $TunnelApiKey
    $env:OPENCLAW_API_KEY = $TunnelApiKey
}

python -m screen_memory_assistant
