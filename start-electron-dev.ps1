$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\electron-app"
$env:ELECTRON_RUN_AS_NODE = $null

if (-not (Test-Path "node_modules")) {
    npm install
}

npm start
