param([string]$UrbanGroundPath=(Join-Path $env:USERPROFILE '.codex/tools/urbanground/windows/UrbanGround-Windows/UrbanGround.exe'))
$ErrorActionPreference='Stop'
$gsxUrbanUrl='http://localhost:8081'
try{$gsxUrbanReady=(Invoke-RestMethod ($gsxUrbanUrl+'/health') -TimeoutSec 2).service -eq 'UrbanGround'}catch{$gsxUrbanReady=$false}
if(-not $gsxUrbanReady){
 if(-not (Test-Path -LiteralPath $UrbanGroundPath)){throw 'UrbanGround.exe was not found. Download the official Windows release from https://github.com/UrbanGround/UrbanGround/releases and pass its path with -UrbanGroundPath.'}
 $gsxUrbanLog=Join-Path $env:TEMP 'gsx-urbanground.log'
 Start-Process -FilePath $UrbanGroundPath -ArgumentList @('-screen-width','1280','-screen-height','720','-screen-fullscreen','0','-logFile',('"'+$gsxUrbanLog+'"')) -WindowStyle Hidden
 for($gsxUrbanAttempt=0;$gsxUrbanAttempt -lt 40;$gsxUrbanAttempt++){
   Start-Sleep -Milliseconds 500
   try{if((Invoke-RestMethod ($gsxUrbanUrl+'/health') -TimeoutSec 1).service -eq 'UrbanGround'){$gsxUrbanReady=$true;break}}catch{}
 }
}
if(-not $gsxUrbanReady){throw 'UrbanGround did not become ready on localhost:8081. Check the native application log.'}
Write-Host 'UrbanGround is connected locally. Open the racing game, choose a Hong Kong KML stage, then select UrbanGround reference.'
