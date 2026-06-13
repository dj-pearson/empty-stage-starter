@echo off
setlocal
REM ============================================================================
REM  run-ralph.cmd — launch our Ralph loop as a good roommate on the shared box.
REM
REM  RULE 3 (stay in your lane): boxed into logical cores 12-23 (affinity FFF000),
REM    below-normal priority so the human's foreground work preempts us, and a
REM    3 GB V8 heap cap so one build can't balloon. GradeThread owns cores 0-11
REM    (affinity FFF).
REM  RULE 1 (never leak): the claude-flow daemon is started ONCE here, detached,
REM    and reused. It is NOT started from a per-session/per-event hook anymore
REM    (that spawned one zombie per event). See .claude/settings.json.
REM  RULE 4 (good roommate): stagger your start a few minutes after GradeThread.
REM
REM  Usage:  scripts\ralph\run-ralph.cmd [iterations]      (default 10)
REM ============================================================================

set "ITER=%~1"
if "%ITER%"=="" set "ITER=10"

REM Always operate from the repo root (two levels up from scripts\ralph\).
cd /d "%~dp0..\.."

REM RULE 1: cap the heap for every node child of this loop.
set "NODE_OPTIONS=--max-old-space-size=3072"

REM RULE 1: start the claude-flow daemon ONCE, detached, then reuse it.
call npx @claude-flow/cli@latest daemon status >nul 2>&1
if errorlevel 1 (
  echo [run-ralph] starting claude-flow daemon once, detached...
  start "claude-flow-daemon" /b cmd /c "npx @claude-flow/cli@latest daemon start --quiet"
) else (
  echo [run-ralph] reusing the already-running claude-flow daemon.
)

echo [run-ralph] launching Ralph: cores 12-23 (FFF000), /belownormal, %ITER% iterations.
echo [run-ralph] RULE 4: if GradeThread just started, wait a few minutes so first builds stagger.
echo [run-ralph] loop output -> scripts\ralph\loop.log
start "RalphOther" /belownormal /affinity FFF000 cmd /c "npm run ralph -- %ITER% 1> scripts\ralph\loop.log 2>&1"

endlocal
