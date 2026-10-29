<#
  Register the Nexsist daily-run task in Windows Task Scheduler (run once).
  Usage:
    powershell -ExecutionPolicy Bypass -File "<this file>"            # default 07:30
    powershell -ExecutionPolicy Bypass -File "<this file>" -At 08:00  # custom time
    powershell -ExecutionPolicy Bypass -File "<this file>" -Unregister
  ASCII-only on purpose (PowerShell 5.1 misreads BOM-less UTF-8 .ps1 as Shift-JIS).
#>
param(
  [string]$At = '06:00',
  [switch]$Unregister
)

$TaskName = 'Nexsist-daily-run'
$Script   = Join-Path $PSScriptRoot 'daily-run.ps1'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Unregistered: $TaskName"
  return
}

if (-not (Test-Path $Script)) { throw "daily-run.ps1 not found: $Script" }

# 1) Allow wake timers (optional; needs admin). powercfg is a native exe, so a
#    non-zero exit does NOT throw - check $LASTEXITCODE after every call and only
#    claim success if all of them returned 0.
$wakeSteps = @(
  @('/SETACVALUEINDEX', 'SCHEME_CURRENT', 'SUB_SLEEP', 'RTCWAKE', '1'),
  @('/SETDCVALUEINDEX', 'SCHEME_CURRENT', 'SUB_SLEEP', 'RTCWAKE', '1'),
  @('/SETACTIVE', 'SCHEME_CURRENT')
)
$wakeOk = $true
$wakeErr = ''
foreach ($step in $wakeSteps) {
  try {
    $out = & powercfg @step 2>&1
    if ($LASTEXITCODE -ne 0) {
      $wakeOk = $false
      if (-not $wakeErr) { $wakeErr = ($out | Out-String).Trim() }
    }
  } catch {
    $wakeOk = $false
    if (-not $wakeErr) { $wakeErr = $_.Exception.Message }
  }
}
if ($wakeOk) {
  Write-Host "[1/3] Wake timers enabled for current power scheme"
} else {
  Write-Host "[1/3] Wake-timer step FAILED - run this script elevated, or enable wake timers manually in Settings > System > Power. Detail: $wakeErr"
}

# 2) Build task
$psArgs  = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Script + '"'
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($At, 'HH:mm', $null))

$setParams = @{
  WakeToRun                  = $true
  StartWhenAvailable         = $true
  AllowStartIfOnBatteries    = $true
  DontStopIfGoingOnBatteries = $true
  ExecutionTimeLimit         = (New-TimeSpan -Hours 2)
  MultipleInstances          = 'IgnoreNew'
  RestartCount               = 2
  RestartInterval            = (New-TimeSpan -Minutes 15)
}
$settings = New-ScheduledTaskSettingsSet @setParams

$me        = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited

Write-Host "[2/3] Registering task..."
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -Description 'Nexsist.cs: deadline watch + validate + codex re-eval + pre-deadline draft revision (daily, unattended)' | Out-Null

# 3) Verify
$t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($t) {
  $next = (Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime
  Write-Host "[3/3] Registered: $TaskName  (daily $At / State=$($t.State) / Next=$next)"
  Write-Host ""
  Write-Host "Manual test : Start-ScheduledTask -TaskName $TaskName"
  Write-Host "Logs        : $(Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\daily')"
} else {
  Write-Error "Registration failed."
}
