# Compiles src-tauri/installer-hooks.nsh into a throwaway installer and checks that
# its pre-install hook ends only sidecars started from the install folder.
# Decoys are copies of PING.EXE in a fresh temp folder; nothing else is touched.
# Needs the NSIS toolchain Tauri downloads to %LOCALAPPDATA%\tauri\NSIS (any
# `pnpm tauri build` with the nsis target fetches it).
$ErrorActionPreference = "Stop"

$makensis = Join-Path $env:LOCALAPPDATA "tauri\NSIS\Bin\makensis.exe"
if (-not (Test-Path $makensis)) { throw "makensis not found at $makensis" }
$hooks = Join-Path $PSScriptRoot "..\src-tauri\installer-hooks.nsh"

$work = Join-Path ([IO.Path]::GetTempPath()) ("frame-hook-test-" + [guid]::NewGuid())
$inst = Join-Path $work "Install Dir"
$other = Join-Path $work "elsewhere"
New-Item -ItemType Directory -Force $inst, $other | Out-Null
Copy-Item $hooks (Join-Path $work "hooks.nsh")
@'
Unicode true
!include "hooks.nsh"
Name "frame-hook-test"
OutFile "hook-test.exe"
RequestExecutionLevel user
SilentInstall silent
Section
  ReadEnvStr $INSTDIR FRAME_HOOK_TEST_INST
  !insertmacro NSIS_HOOK_PREINSTALL
SectionEnd
'@ | Set-Content (Join-Path $work "test.nsi")

$procs = @()
try {
  Push-Location $work
  & $makensis -V1 -WX test.nsi
  if ($LASTEXITCODE -ne 0) { throw "makensis failed with exit code $LASTEXITCODE" }
  Pop-Location

  $ping = Join-Path $env:WINDIR "System32\PING.EXE"
  $cases = @(
    @{ Path = (Join-Path $inst "mpv.exe"); Ends = $true },
    @{ Path = (Join-Path $inst "ffmpeg.exe"); Ends = $true },
    @{ Path = (Join-Path $inst "ffprobe.exe"); Ends = $true },
    @{ Path = (Join-Path $inst "yt-dlp.exe"); Ends = $true },
    @{ Path = (Join-Path $inst "stremio-server-x86_64-pc-windows-msvc.exe"); Ends = $true },
    @{ Path = (Join-Path $inst "frame-helper.exe"); Ends = $false },
    @{ Path = (Join-Path $other "mpv.exe"); Ends = $false },
    @{ Path = (Join-Path $other "ffmpeg.exe"); Ends = $false }
  )
  foreach ($case in $cases) {
    Copy-Item $ping $case.Path
    $case.Process = Start-Process -FilePath $case.Path -ArgumentList "-n", "120", "127.0.0.1" -WindowStyle Hidden -PassThru
    $procs += $case.Process
  }
  Start-Sleep -Milliseconds 800

  $env:FRAME_HOOK_TEST_INST = $inst
  $hook = Start-Process -FilePath (Join-Path $work "hook-test.exe") -Wait -PassThru
  if ($hook.ExitCode -ne 0) { throw "hook test installer exited with $($hook.ExitCode)" }
  Start-Sleep -Milliseconds 1000

  $failed = 0
  foreach ($case in $cases) {
    $case.Process.Refresh()
    $ok = $case.Process.HasExited -eq $case.Ends
    if (-not $ok) { $failed++ }
    "{0} {1} (expected {2})" -f ($(if ($ok) { "ok  " } else { "FAIL" })), $case.Path.Substring($work.Length + 1), $(if ($case.Ends) { "ended" } else { "running" })
  }
  if ($failed -gt 0) { throw "$failed installer hook case(s) failed" }
  "all installer hook cases passed"
} finally {
  foreach ($p in $procs) { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
  Start-Sleep -Milliseconds 300
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
