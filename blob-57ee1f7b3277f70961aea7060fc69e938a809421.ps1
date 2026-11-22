$ErrorActionPreference='Stop'
$gsxUrl='http://127.0.0.1:8799/'
try { $gsxResponse=Invoke-RestMethod -Uri ($gsxUrl+'api/config') -TimeoutSec 2; $gsxReady=$gsxResponse.multiplayer -eq $true } catch { $gsxReady=$false }
if (-not $gsxReady) {
  $gsxNode=(Get-Command node -ErrorAction Stop).Source
  Start-Process -FilePath $gsxNode -ArgumentList @('server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  for ($gsxAttempt=0; $gsxAttempt -lt 30; $gsxAttempt++) { Start-Sleep -Milliseconds 200; try { $gsxResponse=Invoke-RestMethod -Uri ($gsxUrl+'api/config') -TimeoutSec 1; if ($gsxResponse.multiplayer -eq $true) { $gsxReady=$true; break } } catch {} }
}
if (-not $gsxReady) { throw 'Unable to start the GSX game server on port 8799.' }
Start-Process $gsxUrl
