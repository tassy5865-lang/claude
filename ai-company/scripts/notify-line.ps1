<#
  Push a text message to the Nexsist.cs LINE Official Account.
  Config file (git-ignored): scripts/line.local.json
    { "channel_access_token": "<long-lived token>", "mode": "push", "to": "U<32 hex chars>" }
    - mode "push": send to the one LINE user id in "to" (the owner's own id).
    - broadcast is DISABLED (2026-11-24): the OA is public, so broadcast reached all friends.
    "mode" must be exactly "push" and "to" must match ^U[0-9a-f]{32}$ - otherwise exit 1 without sending.
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

$mode = "$($cfg.mode)".Trim().ToLowerInvariant()
# 2026-11-24: broadcast is DISABLED. The OA's add-friend link is public (LP etc.),
# so broadcast reached everyone who added it. Only push to one user id is allowed.
if ($mode -ne 'push') {
  $shown = if ("$($cfg.mode)".Trim()) { "'$($cfg.mode)'" } else { '(missing)' }
  Log "BLOCKED: mode must be 'push' (broadcast is disabled), got $shown"
  Write-Host "LINE notify: only mode 'push' is allowed (got $shown). broadcast is disabled. Not sent."
  exit 1
}
$to = "$($cfg.to)".Trim()
if ($to -cnotmatch '^U[0-9a-f]{32}$') {
  Log "BLOCKED: 'to' is not a LINE user id (U + 32 hex chars)"
  Write-Host "LINE notify: 'to' must be one LINE user id (U + 32 hex chars). Not sent."
  exit 1
}

# LINE text messages are capped at 5000 chars
if ($Text.Length -gt 4900) { $Text = $Text.Substring(0, 4900) + " ...(truncated)" }

$bodyObj = @{ to = $to; messages = @(@{ type = 'text'; text = $Text }) }
$url = 'https://api.line.me/v2/bot/message/push'

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
