<#
  sweep.ps1 — kill THIS repo's stray build processes between iterations (RULE 1 + 4).

  Targets only node/deno processes whose command line BOTH:
    * contains this repo's absolute path, AND
    * looks like a build tool (vite / tsc / tsgo / vitest / esbuild / tsx / ts-node / rollup)
  i.e. leftover build steps that never exited for OUR repo.

  It NEVER kills by bare process name, never touches a process whose command line
  lacks our repo path, and never touches the long-lived claude-flow daemon
  (that is started once, detached, and shared — see run-ralph.cmd). This keeps us
  strictly in our own lane so we can't disrupt the human or the other agent.

  Usage: powershell -NoProfile -ExecutionPolicy Bypass -File sweep.ps1 -RepoRoot "C:\path\to\repo"
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoRoot
)

$ErrorActionPreference = 'SilentlyContinue'

# Normalize for a case-insensitive substring match against CommandLine.
$needle = $RepoRoot.Replace('/', '\').TrimEnd('\').ToLowerInvariant()
$toolRe = '(vite|tsc\b|tsgo|vitest|esbuild|\btsx\b|ts-node|rollup)'

$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'deno.exe'" |
  Where-Object {
    $_.CommandLine -and
    ($_.CommandLine.ToLowerInvariant().Contains($needle)) -and
    ($_.CommandLine -match $toolRe)
  }

$killed = 0
foreach ($p in $procs) {
  try {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    Write-Output ("swept pid {0}: {1}" -f $p.ProcessId, ($p.CommandLine.Substring(0, [Math]::Min(100, $p.CommandLine.Length))))
    $killed++
  } catch { }
}
Write-Output ("sweep: {0} stray build process(es) killed for {1}" -f $killed, $RepoRoot)
exit 0
