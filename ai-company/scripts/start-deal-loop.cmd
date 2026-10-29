@echo off
REM ------------------------------------------------------------------
REM  Nexsist.cs - deal-sweep loop launcher
REM  Keep this window OPEN and Chrome logged in to CrowdWorks.
REM  Usage:  start-deal-loop.cmd          (default: every 4h)
REM          start-deal-loop.cmd 6h       (custom interval)
REM  Stop:   press Ctrl+C in this window, or close it.
REM ------------------------------------------------------------------
setlocal
set "INTERVAL=%~1"
if "%INTERVAL%"=="" set "INTERVAL=4h"

cd /d "%~dp0.."
echo.
echo   Nexsist deal-sweep loop  -  interval: %INTERVAL%
echo   Working dir: %CD%
echo   Requirements: Chrome open + logged in to CrowdWorks + claude-in-chrome extension connected
echo   Leave this window open. Ctrl+C to stop.
echo.

claude "/loop %INTERVAL% /deal-sweep"
