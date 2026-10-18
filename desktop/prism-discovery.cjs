const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { findPrism, isPrismExecutable } = require("./core.cjs");

const execFileAsync = promisify(execFile);

// Read registered installs and shortcuts without executing any discovered target.
const windowsDiscoveryScript = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'SilentlyContinue'
$candidates = [System.Collections.Generic.List[string]]::new()
Get-Process -Name prismlauncher | ForEach-Object { if ($_.Path) { $candidates.Add($_.Path) } }
foreach ($key in @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\prismlauncher.exe',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\prismlauncher.exe',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\prismlauncher.exe'
)) {
  $target = (Get-ItemProperty -LiteralPath $key).'(default)'
  if ($target) { $candidates.Add($target.Trim('"')) }
}
Get-ItemProperty -Path @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
) | Where-Object { $_.DisplayName -match '^Prism\s*Launcher(?:\s|$)' } | ForEach-Object {
  if ($_.InstallLocation) { $candidates.Add((Join-Path $_.InstallLocation 'prismlauncher.exe')) }
  if ($_.DisplayIcon -match '^"?(.+?prismlauncher\.exe)"?(?:,\s*-?\d+)?$') { $candidates.Add($Matches[1]) }
}
try {
  $shell = New-Object -ComObject WScript.Shell
  foreach ($folder in @('StartMenu', 'CommonStartMenu', 'DesktopDirectory', 'CommonDesktopDirectory')) {
    $root = [Environment]::GetFolderPath($folder)
    if ($root -and (Test-Path -LiteralPath $root)) {
      Get-ChildItem -LiteralPath $root -Filter '*Prism*.lnk' -File -Recurse | Select-Object -First 100 | ForEach-Object {
        $target = $shell.CreateShortcut($_.FullName).TargetPath
        if ($target) { $candidates.Add($target) }
      }
    }
  }
} finally { if ($shell) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) } }
ConvertTo-Json -InputObject @($candidates) -Compress
`;

async function scanWindowsInstallations(env) {
  const powershell = path.join(env.SystemRoot || env.SYSTEMROOT || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const { stdout } = await execFileAsync(powershell, ["-NoProfile", "-NonInteractive", "-Command", windowsDiscoveryScript], {
    windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024, encoding: "utf8",
  });
  const parsed = JSON.parse(stdout.replace(/^\uFEFF/, "").trim() || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

function createPrismDetector({
  platform = process.platform,
  env = process.env,
  bundledPath = null,
  scanInstallations = () => platform === "win32" ? scanWindowsInstallations(env) : Promise.resolve([]),
  now = Date.now,
  cacheMs = 30_000,
} = {}) {
  let cachedPath = null;
  let checkedAt = -Infinity;
  let pending = null;

  return async function detect(savedPath, { refresh = false } = {}) {
    if (isPrismExecutable(savedPath)) return { path: savedPath, source: "saved" };
    if (isPrismExecutable(bundledPath)) return { path: bundledPath, source: "bundled" };
    const quick = findPrism(null, platform, env);
    if (quick) return { path: quick, source: "auto" };
    if (!refresh && isPrismExecutable(cachedPath)) return { path: cachedPath, source: "auto" };
    const moved = Boolean(cachedPath && !isPrismExecutable(cachedPath));
    if (!refresh && !moved && !pending && now() - checkedAt < cacheMs) return { path: null, source: "missing" };

    if (!pending) {
      pending = (async () => {
        try {
          const candidates = await scanInstallations();
          cachedPath = candidates.find(isPrismExecutable) || null;
        } catch {
          cachedPath = null;
        } finally {
          checkedAt = now();
        }
      })().finally(() => { pending = null; });
    }
    await pending;
    return { path: cachedPath, source: cachedPath ? "auto" : "missing" };
  };
}

module.exports = { createPrismDetector, scanWindowsInstallations };
