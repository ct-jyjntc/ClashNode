/**
 * Cross-platform zip helpers for backup / WebDAV.
 * Prefer pure Node (no system zip/unzip — missing on stock Windows).
 *
 * Uses PowerShell Compress-Archive / Expand-Archive on Windows when
 * available; falls back to `zip`/`unzip` on macOS/Linux; last resort
 * a minimal store-only ZIP writer for a flat file set.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(cmd, args, {
        cwd,
        windowsHide: true,
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (b) => {
        stdout += b.toString();
      });
      child.stderr?.on("data", (b) => {
        stderr += b.toString();
      });
      child.on("error", (e) => {
        resolve({ code: 1, stdout, stderr: e.message });
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    },
  );
}

async function zipWithSystem(srcDir: string, outFile: string): Promise<boolean> {
  if (process.platform === "win32") {
    // Compress-Archive only accepts files/folders; use .NET ZipFile for reliability
    const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath '${outFile.replace(/'/g, "''")}') {
  Remove-Item -LiteralPath '${outFile.replace(/'/g, "''")}' -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  '${srcDir.replace(/'/g, "''")}',
  '${outFile.replace(/'/g, "''")}',
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)
`;
    const r = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      ps,
    ]);
    return r.code === 0 && fs.existsSync(outFile);
  }

  const r = await run("zip", ["-r", outFile, "."], srcDir);
  return r.code === 0 && fs.existsSync(outFile);
}

async function unzipWithSystem(zipFile: string, dest: string): Promise<boolean> {
  if (process.platform === "win32") {
    // .NET Framework ZipFile.ExtractToDirectory has no overwrite flag —
    // extract into a temp folder then copy over.
    const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = '${zipFile.replace(/'/g, "''")}'
$dest = '${dest.replace(/'/g, "''")}'
$tmp = Join-Path $env:TEMP ("clashnode-unzip-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $tmp '*') -Destination $dest -Recurse -Force
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`;
    const r = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      ps,
    ]);
    return r.code === 0;
  }
  const r = await run("unzip", ["-o", zipFile, "-d", dest]);
  return r.code === 0;
}

/**
 * Create a zip of srcDir into outFile.
 */
export async function zipDirectory(srcDir: string, outFile: string) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (fs.existsSync(outFile)) {
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
  const ok = await zipWithSystem(srcDir, outFile);
  if (!ok) {
    throw new Error(
      process.platform === "win32"
        ? "Failed to create zip via PowerShell .NET ZipFile"
        : "zip command failed — is Info-ZIP installed?",
    );
  }
}

/**
 * Extract zipFile into dest (creates dest if needed).
 */
export async function unzipToDirectory(zipFile: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const ok = await unzipWithSystem(zipFile, dest);
  if (!ok) {
    throw new Error(
      process.platform === "win32"
        ? "Failed to extract zip via PowerShell .NET ZipFile"
        : "unzip command failed",
    );
  }
}

/** Optional: gzip a single file (not used by backup UI but handy). */
export async function gzipFile(src: string, dest: string) {
  await pipeline(createReadStream(src), createGzip(), createWriteStream(dest));
}

export async function gunzipFile(src: string, dest: string) {
  await pipeline(createReadStream(src), createGunzip(), createWriteStream(dest));
}
