$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledMkcert = Join-Path $projectRoot '.tools\mkcert.exe'
$mkcertCommand = Get-Command mkcert -ErrorAction SilentlyContinue
$mkcert = if (Test-Path -LiteralPath $bundledMkcert) { $bundledMkcert } elseif ($mkcertCommand) { $mkcertCommand.Source } else { $null }

if (-not $mkcert) {
  throw 'mkcert was not found. Put mkcert.exe in .tools or install mkcert, then run this command again.'
}

$certificateDirectory = Join-Path $projectRoot '.cert'
$certificateFile = Join-Path $certificateDirectory 'sola-worship.pem'
$certificateKeyFile = Join-Path $certificateDirectory 'sola-worship-key.pem'
New-Item -ItemType Directory -Force -Path $certificateDirectory | Out-Null

& $mkcert -install
if ($LASTEXITCODE -ne 0) { throw 'mkcert could not install its local certificate authority.' }

$addresses = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -Unique
$names = @('localhost', '127.0.0.1', '::1') + $addresses

& $mkcert -cert-file $certificateFile -key-file $certificateKeyFile @names
if ($LASTEXITCODE -ne 0) { throw 'mkcert could not create the Sola Worship certificate.' }

$caRoot = & $mkcert -CAROOT
Copy-Item -LiteralPath (Join-Path $caRoot 'rootCA.pem') -Destination (Join-Path $certificateDirectory 'rootCA.pem') -Force

Write-Host ''
Write-Host 'Sola Worship HTTPS is ready.' -ForegroundColor Green
Write-Host 'Restart the app with: npm run dev:https'
foreach ($address in $addresses) {
  Write-Host "Phone URL base: https://${address}:5173"
}
Write-Host 'Install .cert\rootCA.pem on each phone before opening its pairing URL.'
