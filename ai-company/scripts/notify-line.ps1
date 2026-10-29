<#
  Push a text message to the Nexsist.cs LINE Official Account.
  Config file (git-ignored): scripts/line.local.json
    { "channel_access_token": "<long-lived token>", "mode": "broadcast", "to": "" }
    - mode "broadcast": send to ALL friends of the OA (no user id needed; best when only you are a friend)
    - mode "push":      send to one user id / group id in "to"
    "mode" is REQUIRED and must be exactly "push" or "broadcast" - any other/missing value exits 1 without sending.
  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/notify-line.ps1 -Text "hello"
  Exit codes: 0 = sent, 2 = not configured (skip, non-fatal), 1 = send failed
  ASCII-only on purpose.
#>
param(
  [Parameter(Mandatory = $true)][string]$Text
)
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot            # ...\ai-company
$cfgPath = Join-Path $PSScriptRoot 'line.local.json'
$logDir  = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'line-notify.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Log($m) { "$(Get-Date -Format o)  $m" | Out-File -FilePath $logFile -Append -Encoding utf8 }

if (-not (Test-Path $cfgPath)) {
  Log "NOT CONFIGURED (no line.local.json)"
  Write-Host "LINE notify: not configured (scripts/line.local.json missing). Skipped."
  exit 2
}

try { $cfg = Get-Content -Raw -Encoding utf8 $cfgPath | ConvertFrom-Json }
catch { Log "BAD CONFIG: $_"; Write-Host "LINE notify: line.local.json is not valid JSON."; exit 1 }

$token = "$($cfg.channel_access_token)".Trim()
if (-not $token -or $token -like 'PASTE_*') {
  Log "NOT CONFIGURED (empty token)"
  Write-Host "LINE notify: channel_access_token not set in line.local.json. Skipped."
  exit 2
}

# mode must be exactly "push" or "broadcast". An unknown or missing value is a
# hard error here on purpose: falling back to broadcast on a typo (e.g. "pus h")
# would blast every friend of the OA. No silent default.
$mode = "$($cfg.mode)".Trim().ToLowerInvariant()
if ($mode -ne 'push' -and $mode -ne 'broadcast') {
  $shown = if ("$($cfg.mode)".Trim()) { "'$($cfg.mode)'" } else { '(missing)' }
  Log "BAD CONFIG: mode must be 'push' or 'broadcast', got $shown"
  Write-Host "LINE notify: line.local.json 'mode' must be exactly 'push' or 'broadcast' (got $shown). Not sent."
  exit 1
}

# LINE text messages are capped at 5000 chars
if ($Text.Length -gt 4900) { $Text = $Text.Substring(0, 4900) + " ...(truncated)" }

$bodyObj = @{ messages = @(@{ type = 'text'; text = $Text }) }
if ($mode -eq 'push') {
  $to = "$($cfg.to)".Trim()
  if (-not $to) { Log "PUSH mode but 'to' empty"; Write-Host "LINE notify: mode=push but 'to' is empty."; exit 1 }
  $bodyObj.to = $to
  $url = 'https://api.line.me/v2/bot/message/push'
} else {
  $url = 'https://api.line.me/v2/bot/message/broadcast'
}

$json = $bodyObj | ConvertTo-Json -Depth 6 -Compress
try {
  Invoke-RestMethod -Method Post -Uri $url -Headers @{
    Authorization  = "Bearer $token"
    'Content-Type' = 'application/json'
  } -Body ([Text.Encoding]::UTF8.GetBytes($json)) | Out-Null
  Log "SENT ($mode) : $($Text -replace '\r?\n',' | ')"
  Write-Host "LINE notify: sent ($mode)."
  exit 0
}
catch {
  $detail = $_.Exception.Message
  try { $detail = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
  Log "FAILED ($mode): $detail"
  Write-Host "LINE notify: FAILED - $detail"
  exit 1
}
