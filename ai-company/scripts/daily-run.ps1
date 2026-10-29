<#
  Nexsist.cs virtual-org - once-a-day unattended maintenance runner.
  Invoked by Windows Task Scheduler. Manual test:
    powershell -ExecutionPolicy Bypass -File "<this file>"
  ASCII-only on purpose (PowerShell 5.1 misreads BOM-less UTF-8 .ps1 as Shift-JIS).
#>
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)

$RepoRoot   = Split-Path -Parent $PSScriptRoot          # ...\ai-company
$ParentDir  = Split-Path -Parent $RepoRoot              # ...\claude  (for codex -C)
$PromptFile = Join-Path $PSScriptRoot 'daily-run.md'
$LogDir     = Join-Path $RepoRoot 'logs\daily'
$Stamp      = Get-Date -Format 'yyyy-MM-dd'
$LogFile    = Join-Path $LogDir "$Stamp.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# One log-write path (plain .NET append, UTF-8 w/ BOM) so the whole day's file is
# a single consistent encoding. A function, not a pipeline stage - it must never
# disturb $LASTEXITCODE.
$LogEnc = [Text.UTF8Encoding]::new($true)
function Write-Log([string]$Message) {
  Write-Host $Message
  [IO.File]::AppendAllText($LogFile, $Message + "`r`n", $LogEnc)
}

Write-Log "==== daily-run start $(Get-Date -Format o) ===="

$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if (-not (Test-Path $claude)) {
  Write-Log "ERROR: claude CLI not found"
  exit 1
}
if (-not (Test-Path $PromptFile)) {
  Write-Log "ERROR: prompt file missing: $PromptFile"
  exit 1
}

$prompt = Get-Content -Raw -Encoding utf8 $PromptFile
$prompt = "Working directory: $RepoRoot`nParent dir to pass to codex -C: $ParentDir`n`n" + $prompt

# --permission-mode acceptEdits: file edits go through without a prompt; every other
#   gated action must be pre-approved in ai-company/.claude/settings.json ("allow" list),
#   otherwise it fails fast (no hang) - the safe posture for an unattended run.
# --strict-mcp-config (no --mcp-config): load zero MCP servers; codex is used via CLI.
$cliArgs = @('-p', '--permission-mode', 'acceptEdits', '--strict-mcp-config', '--model', 'sonnet')

Push-Location $RepoRoot
try {
  $cliOutput = $prompt | & $claude @cliArgs 2>&1
  $code = $LASTEXITCODE
}
finally {
  Pop-Location
}
[IO.File]::AppendAllText($LogFile, (($cliOutput | Out-String)), $LogEnc)

# --- Authoritative gate: re-run the scaffold validation from the runner ------
#   The unattended prompt is designed to RECORD a validation failure and keep
#   going (so a human sees it in the log), which means the CLI can exit 0 with a
#   broken scaffold. Re-run the gate here and fold its result into the task exit
#   code, independent of the CLI exit code.
$validate = Join-Path $PSScriptRoot 'validate_scaffold.py'
$python = (Get-Command py -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command python  -ErrorAction SilentlyContinue).Source }
if (-not $python) { $python = (Get-Command python3 -ErrorAction SilentlyContinue).Source }

$validateCode = -1   # -1 = gate did not run
if (-not $python) {
  Write-Log "WARN: python not found - validate_scaffold.py gate skipped"
} elseif (-not (Test-Path $validate)) {
  Write-Log "WARN: validate_scaffold.py missing - gate skipped"
} else {
  $pyPrefix = @()
  if ((Split-Path -Leaf $python) -match '^py(\.exe)?$') { $pyPrefix = @('-3') }
  $vout = & $python @pyPrefix $validate 2>&1
  $validateCode = $LASTEXITCODE
  [IO.File]::AppendAllText($LogFile, (($vout | Out-String)), $LogEnc)
}

# --- Structured completion sentinel ----------------------------------------
#   daily-run.md step 6 requires the session's FINAL non-empty output line to be
#   exactly one status token. Checking only the last line (not a substring
#   anywhere) avoids matching the token where the prompt text quotes it.
$outLines = @($cliOutput | ForEach-Object { "$_" } | Where-Object { $_.Trim() -ne '' })
# The CLI can append stderr noise after the token (e.g. "SessionEnd hook ...
#   Hook cancelled" wrapped as an ErrorRecord by 2>&1), so use the last line that
#   is EXACTLY a status token rather than blindly the last line.
$statusLines = @($outLines | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^DAILY-RUN-STATUS: (OK|NEEDS-ATTENTION)$' })
$lastLine = if ($statusLines.Count) { $statusLines[-1] } else { '' }
$statusOk   = ($lastLine -eq 'DAILY-RUN-STATUS: OK')
$statusAttn = ($lastLine -eq 'DAILY-RUN-STATUS: NEEDS-ATTENTION')

# Final task result: 0 only if the CLI succeeded, validation passed (or could not
# run), a status line was printed, and it was not NEEDS-ATTENTION.
$final = 0
if     ($code -ne 0)         { $final = $code }
elseif ($validateCode -gt 0) { $final = 3 }
elseif ($statusAttn)         { $final = 4 }
elseif (-not $statusOk)      { $final = 5 }

Write-Log "==== daily-run end $(Get-Date -Format o) cli=$code validate=$validateCode statusOk=$statusOk exit=$final ===="

Get-ChildItem $LogDir -Filter '*.log' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $final
