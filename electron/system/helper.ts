/**
 * Windows Helper Service client (FlClash-aligned).
 *
 * ClashNodeHelperService is a native Windows Service that owns elevated
 * mihomo processes so TUN/Wintun works without running the whole Electron
 * app as Administrator.
 *
 * Local API: http://127.0.0.1:47891  { /ping, /start, /stop, /logs }
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { fileURLToPath } from "node:url";
import { getHomeDir, ensureDir } from "../store/paths";
import { runElevatedPowerShell } from "./elevate";

const execFileAsync = promisify(execFile);

export const HELPER_SERVICE_NAME = "ClashNodeHelperService";
export const HELPER_PORT = 47891;
export const HELPER_BASE = `http://127.0.0.1:${HELPER_PORT}`;

export type HelperServiceStatus = "none" | "presence" | "running";

function resourceBinCandidates(): string[] {
  if (app.isPackaged) {
    return [path.join(process.resourcesPath, "bin")];
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.join(process.cwd(), "resources", "bin"),
    path.join(app.getAppPath(), "resources", "bin"),
    path.join(__dirname, "../../resources/bin"),
  ];
}

/** Packaged/dev path for ClashNodeHelperService.exe */
export function getHelperSourcePath(): string {
  const names = [
    "ClashNodeHelperService.exe",
    "helper.exe",
    "ClashNodeHelperService",
    "helper",
  ];
  for (const dir of resourceBinCandidates()) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (fs.existsSync(p)) return p;
    }
  }
  return path.join(resourceBinCandidates()[0], "ClashNodeHelperService.exe");
}

/**
 * Runtime install path for the helper binary.
 * Services should not run from a temp/dev tree that may disappear; copy into
 * userData/bin when packaged (or when source is under resources).
 */
export function getHelperInstallPath(): string {
  const src = getHelperSourcePath();
  if (!fs.existsSync(src)) return src;

  if (!app.isPackaged && process.env.CLASHNODE_HELPER_USE_SOURCE === "1") {
    return src;
  }

  const workDir = path.join(getHomeDir(), "bin");
  ensureDir(workDir);
  const dest = path.join(workDir, "ClashNodeHelperService.exe");
  try {
    if (fs.existsSync(dest)) {
      const srcM = fs.statSync(src).mtimeMs;
      const dstM = fs.statSync(dest).mtimeMs;
      if (srcM <= dstM) return dest;
    }
    fs.copyFileSync(src, dest);
  } catch {
    return src;
  }
  return dest;
}

export function sha256File(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

/** SHA256 of the mihomo binary the helper is allowed to start (release builds). */
export function getCoreToken(mihomoPath: string): string {
  return sha256File(mihomoPath) || "";
}

export async function pingHelper(expectedToken?: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${HELPER_BASE}/ping`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.text()).trim();
    // Empty TOKEN in debug helper → any response is OK
    if (!expectedToken) return true;
    if (!body) return true;
    return body === expectedToken;
  } catch {
    return false;
  }
}

export async function checkHelperService(
  expectedToken?: string,
): Promise<HelperServiceStatus> {
  if (process.platform !== "win32") return "none";
  try {
    const { stdout } = await execFileAsync(
      "sc",
      ["query", HELPER_SERVICE_NAME],
      { windowsHide: true, timeout: 8_000 },
    );
    if (!stdout.includes("RUNNING")) {
      return "presence";
    }
    if (await pingHelper(expectedToken)) return "running";
    return "presence";
  } catch {
    return "none";
  }
}

/**
 * Install (or reinstall) + start the Windows service via elevated cmd.
 * Mirrors FlClash registerService().
 */
export async function registerHelperService(
  mihomoPath: string,
): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "win32") {
    return { ok: false, message: "Helper service is Windows-only" };
  }

  const helperPath = getHelperInstallPath();
  if (!fs.existsSync(helperPath)) {
    return {
      ok: false,
      message: `Helper binary not found: ${helperPath}. Run scripts/build-helper.sh (or npm run build:helper).`,
    };
  }

  // Ensure work copy exists next to userData
  const installPath = getHelperInstallPath();
  const status = await checkHelperService(getCoreToken(mihomoPath));
  if (status === "running") {
    return { ok: true, message: "Helper service already running" };
  }

  // sc create needs unquoted path with spaces carefully escaped for cmd
  const binPath = installPath.replace(/"/g, "");
  const name = HELPER_SERVICE_NAME;

  const script = `
$ErrorActionPreference = 'Continue'
$svc = '${name}'
$bin = '${binPath.replace(/'/g, "''")}'
# stop / delete stale service
$q = sc.exe query $svc 2>$null
if ($LASTEXITCODE -eq 0) {
  sc.exe stop $svc 2>$null | Out-Null
  Start-Sleep -Milliseconds 400
  sc.exe delete $svc 2>$null | Out-Null
  Start-Sleep -Milliseconds 400
}
# kill orphan helper process
Get-Process -Name 'ClashNodeHelperService','helper' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
sc.exe create $svc binPath= "$bin" start= auto DisplayName= "ClashNode Helper Service" | Out-Null
sc.exe description $svc "Elevated mihomo host for ClashNode TUN" | Out-Null
sc.exe start $svc | Out-Null
exit 0
`;

  const res = await runElevatedPowerShell(script);
  // Poll until running
  for (let i = 0; i < 8; i++) {
    await sleep(500 + i * 200);
    const st = await checkHelperService();
    if (st === "running") {
      return { ok: true, message: "Helper service installed and running" };
    }
  }

  const final = await checkHelperService();
  if (final === "running") {
    return { ok: true, message: "Helper service running" };
  }
  return {
    ok: false,
    message:
      res.message ||
      `Helper service not running (status=${final}). UAC may have been cancelled.`,
  };
}

export async function startCoreByHelper(opts: {
  path: string;
  args: string[];
  cwd?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${HELPER_BASE}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: opts.path,
        args: opts.args,
        arg: "",
        cwd: opts.cwd || "",
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = (await res.text()).trim();
    if (!res.ok) {
      return { ok: false, message: text || `HTTP ${res.status}` };
    }
    // Helper returns empty body on success; error strings otherwise
    if (text) {
      return { ok: false, message: text };
    }
    return { ok: true, message: "started" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function stopCoreByHelper(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${HELPER_BASE}/stop`, {
      method: "POST",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    // Service not installed / not listening — not an error for non-TUN starts
    return false;
  }
}

export async function helperLogs(): Promise<string> {
  try {
    const res = await fetch(`${HELPER_BASE}/logs`);
    return await res.text();
  } catch {
    return "";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Launch EnableLoopback.exe elevated (UWP loopback exemption UI). */
export async function openEnableLoopback(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (process.platform !== "win32") {
    return { ok: false, message: "EnableLoopback is Windows-only" };
  }
  let exe = "";
  for (const dir of resourceBinCandidates()) {
    const p = path.join(dir, "EnableLoopback.exe");
    if (fs.existsSync(p)) {
      exe = p;
      break;
    }
  }
  if (!exe) {
    return {
      ok: false,
      message: "EnableLoopback.exe not found under resources/bin",
    };
  }
  const quoted = exe.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
Start-Process -FilePath '${quoted}' -Verb RunAs
exit 0
`;
  return runElevatedPowerShell(script);
}
