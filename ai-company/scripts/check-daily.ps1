<#  Show the status and latest log of the Nexsist-daily-run task.  #>
# Do NOT swallow errors: "not registered" and "access denied" are different
# problems and need different fixes. -ErrorAction Stop + catch lets us tell them
# apart instead of printing "Task not found" for both.
$info = $null
try {
  $info = Get-ScheduledTaskInfo -TaskName 'Nexsist-daily-run' -ErrorAction Stop
} catch {
  $msg = $_.Exception.Message
  $notFound = ($_.CategoryInfo.Category -eq 'ObjectNotFound') -or ($msg -match 'No MSFT_ScheduledTask objects found|cannot find the file|does not exist')
  if ($notFound) {
    Write-Host "Task NOT REGISTERED: 'Nexsist-daily-run' does not exist."
    Write-Host "  Fix: powershell -ExecutionPolicy Bypass -File scripts\register-daily-task.ps1"
  } elseif ($msg -match 'Access is denied|denied') {
    Write-Host "Task status UNAVAILABLE: access denied."
    Write-Host "  Fix: re-run this script from an elevated PowerShell (Run as administrator)."
  } else {
    Write-Host "Task status UNAVAILABLE: $msg"
  }
}
if ($info) {
  Write-Host "LastRunTime   : $($info.LastRunTime)"
  Write-Host "LastTaskResult: $($info.LastTaskResult)   (0 = OK, 267009 = still running)"
  Write-Host "NextRunTime   : $($info.NextRunTime)"
}
Write-Host ("-" * 60)

$logDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\daily'
$log = Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($log) {
  Write-Host "Log: $($log.FullName)  (updated $($log.LastWriteTime))"
  Write-Host ("-" * 60)
  Get-Content -Encoding utf8 $log.FullName -Tail 60
} else {
  Write-Host "No log file yet in $logDir"
}
