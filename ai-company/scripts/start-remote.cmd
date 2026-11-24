@echo off
REM ------------------------------------------------------------------
REM  Nexsist.cs - Remote Control launcher (use /find-deals from phone)
REM  Starts a Claude Code session on THIS PC that the Claude mobile app
REM  (Code tab) or claude.ai/code can drive. Skills, sales/private files,
REM  codex and the claude-in-chrome browser all stay on this PC.
REM  Keep this window OPEN, PC awake, Chrome open with the extension.
REM  Usage:  start-remote.cmd            (new session)
REM          start-remote.cmd -c         (reattach to the last one, ~4h)
REM  Stop:   Ctrl+C in this window, or close it.
REM ------------------------------------------------------------------
setlocal
cd /d "%~dp0.."
echo.
echo   Nexsist Remote Control  -  dir: %CD%
echo   On the phone: Claude app ^> Code ^> "Nexsist ai-company" ^> type /find-deals
echo   Leave this window open. Ctrl+C to stop.
echo.

claude remote-control --name "Nexsist ai-company" %*
