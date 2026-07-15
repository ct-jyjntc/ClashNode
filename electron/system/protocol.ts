/**
 * Deep-link protocol registration for clash:// and clashnode://
 * Windows: HKCU Classes registry (FlClash-style)
 * macOS: Electron setAsDefaultProtocolClient
 */
import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const SCHEMES = ["clash", "clashnode"] as const;

export function registerDefaultProtocols() {
  for (const scheme of SCHEMES) {
    try {
      if (process.defaultApp) {
        app.setAsDefaultProtocolClient(scheme, process.execPath, [
          path.resolve(process.argv[1] || "."),
        ]);
      } else {
        app.setAsDefaultProtocolClient(scheme);
      }
    } catch {
      /* ignore */
    }
  }

  if (process.platform === "win32") {
    void registerWindowsProtocols().catch(() => undefined);
  }
}

/** Windows: write HKCU Classes so browsers/explorer resolve clash:// */
async function registerWindowsProtocols() {
  const exe = process.execPath.replace(/'/g, "''");
  for (const scheme of SCHEMES) {
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$root = 'HKCU:\\Software\\Classes\\${scheme}'
New-Item -Path $root -Force | Out-Null
Set-ItemProperty -Path $root -Name '(Default)' -Value 'URL:${scheme} Protocol'
Set-ItemProperty -Path $root -Name 'URL Protocol' -Value ''
$cmd = Join-Path $root 'shell\\open\\command'
New-Item -Path $cmd -Force | Out-Null
Set-ItemProperty -Path $cmd -Name '(Default)' -Value '"${exe}" "%1"'
`;
    try {
      await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          ps,
        ],
        { windowsHide: true, timeout: 10_000 },
      );
    } catch {
      /* ignore */
    }
  }
}
