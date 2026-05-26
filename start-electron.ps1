$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$appRoot = Join-Path $projectRoot "electron-app"
$electronExe = Join-Path $appRoot "node_modules\electron\dist\electron.exe"
$logDir = Join-Path $projectRoot "data\logs"

Set-Location $appRoot
$env:ELECTRON_RUN_AS_NODE = $null

if (-not (Test-Path "node_modules") -or -not (Test-Path $electronExe)) {
    npm install
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Process `
    -FilePath $electronExe `
    -ArgumentList @(".") `
    -WorkingDirectory $appRoot `
    -RedirectStandardOutput (Join-Path $logDir "electron.out.log") `
    -RedirectStandardError (Join-Path $logDir "electron.err.log")
