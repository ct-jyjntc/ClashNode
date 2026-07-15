/**
 * Privilege helpers for TUN.
 * - Windows: detect admin; UAC prep (firewall / unblock). Prefer
 *   ClashNodeHelperService (see helper.ts) for actually running mihomo elevated.
 * - macOS: handled in supervisor via osascript
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { getHomeDir } from "../store/paths";

const execFileAsync = promisify(execFile);

export function tunFlagPath() {
  return path.join(getHomeDir(), "tun-elevated.flag");
}

export function markTunElevated() {
  try {
    fs.writeFileSync(tunFlagPath(), new Date().toISOString(), "utf8");
  } catch {
    /* ignore */
  }
}

export function isTunMarkedElevated() {
  return fs.existsSync(tunFlagPath());
}

/** Windows: net session succeeds only when elevated. */
export async function isWindowsAdmin(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    await execFileAsync("net", ["session"], {
      windowsHide: true,
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a PowerShell script elevated (UAC). Returns false if user cancels.
 */
export async function runElevatedPowerShell(
  scriptBody: string,
): Promise<{ ok: boolean; message: string }> {
  const tmp = path.join(
    process.env.TEMP || process.env.TMP || getHomeDir(),
    `clashnode-elevate-${Date.now()}.ps1`,
  );
  fs.writeFileSync(tmp, scriptBody, "utf8");
  try {
    const argList = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      tmp,
    ]
      .map((a) => `'${a.replace(/'/g, "''")}'`)
      .join(",");

    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @(${argList}); if (-not $?) { exit 1 }`,
      ],
      { windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
    return {
      ok: true,
      message: `${stdout || ""}${stderr || ""}`.trim() || "Elevated OK",
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Windows TUN prepare: unblock mihomo, firewall allow, write elevated flag.
 */
export async function authorizeWindowsTun(
  mihomoPath: string,
): Promise<{ ok: boolean; message: string }> {
  if (await isWindowsAdmin()) {
    try {
      await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Unblock-File -LiteralPath '${mihomoPath.replace(/'/g, "''")}' -ErrorAction SilentlyContinue`,
        ],
        { windowsHide: true },
      );
    } catch {
      /* ignore */
    }
    markTunElevated();
    return {
      ok: true,
      message: "Running as Administrator — TUN ready",
    };
  }

  if (isTunMarkedElevated()) {
    return {
      ok: true,
      message: "Already authorized (elevated flag present)",
    };
  }

  const flag = tunFlagPath().replace(/'/g, "''");
  const bin = mihomoPath.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Continue'
$bin = '${bin}'
$flag = '${flag}'
if (Test-Path -LiteralPath $bin) {
  Unblock-File -LiteralPath $bin -ErrorAction SilentlyContinue
}
$dir = Split-Path -Parent $bin
New-Item -ItemType Directory -Force -Path $dir | Out-Null
New-Item -ItemType File -Path $flag -Force | Out-Null
try {
  $name = 'ClashNode mihomo'
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if (-not $existing) {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Program $bin -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -DisplayName "$name Out" -Direction Outbound -Program $bin -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
  }
} catch {}
exit 0
`;

  const res = await runElevatedPowerShell(script);
  if (res.ok && isTunMarkedElevated()) {
    return {
      ok: true,
      message:
        "Firewall prep complete. Install Helper Service (Authorize TUN) so mihomo can create Wintun.",
    };
  }
  return {
    ok: false,
    message:
      res.message ||
      "UAC cancelled. Use Authorize TUN to install ClashNodeHelperService, or run as Administrator.",
  };
}
