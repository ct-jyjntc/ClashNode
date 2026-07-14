import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WebDavSettings } from "../shared/types";
import { getHomeDir } from "./paths";

function remoteBase(settings: WebDavSettings) {
  const base = settings.url.replace(/\/+$/, "");
  const p = (settings.path || "/ClashNode").replace(/\/+$/, "");
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

function curlAuth(settings: WebDavSettings) {
  return ["-u", `${settings.username}:${settings.password}`];
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(cmd, args, cwd ? { cwd } : undefined);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b) => {
        stdout += b.toString();
      });
      child.stderr.on("data", (b) => {
        stderr += b.toString();
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    },
  );
}

export async function webdavUploadBackup(settings: WebDavSettings) {
  if (!settings.url) throw new Error("WebDAV URL is empty");
  const home = getHomeDir();
  const tmp = path.join(os.tmpdir(), `clashnode-webdav-${Date.now()}.zip`);
  const z = await run("zip", ["-r", tmp, "."], home);
  if (z.code !== 0) throw new Error(z.stderr || `zip failed: ${z.code}`);

  const remoteDir = remoteBase(settings);
  const remote = `${remoteDir}/clashnode-backup.zip`;
  await run("curl", ["-sS", "-X", "MKCOL", ...curlAuth(settings), remoteDir]);
  const up = await run("curl", [
    "-sS",
    "-f",
    "-T",
    tmp,
    ...curlAuth(settings),
    remote,
  ]);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (up.code !== 0) {
    throw new Error(up.stderr || up.stdout || "WebDAV upload failed");
  }
  return remote;
}

export async function webdavDownloadBackup(settings: WebDavSettings) {
  if (!settings.url) throw new Error("WebDAV URL is empty");
  const remote = `${remoteBase(settings)}/clashnode-backup.zip`;
  const tmp = path.join(
    os.tmpdir(),
    `clashnode-webdav-restore-${Date.now()}.zip`,
  );
  const dl = await run("curl", [
    "-sS",
    "-f",
    "-o",
    tmp,
    ...curlAuth(settings),
    remote,
  ]);
  if (dl.code !== 0) {
    throw new Error(dl.stderr || "WebDAV download failed");
  }
  const home = getHomeDir();
  const uz = await run("unzip", ["-o", tmp, "-d", home]);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (uz.code !== 0) throw new Error(uz.stderr || `unzip failed: ${uz.code}`);
  return true;
}

export async function webdavTest(settings: WebDavSettings) {
  if (!settings.url) throw new Error("WebDAV URL is empty");
  const target = settings.url.replace(/\/+$/, "");
  const res = await run("curl", [
    "-sS",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "-X",
    "PROPFIND",
    "-H",
    "Depth: 0",
    ...curlAuth(settings),
    target,
  ]);
  const code = res.stdout.trim();
  if (res.code !== 0 && !code) throw new Error(res.stderr || "curl failed");
  if (code === "401" || code === "403") {
    throw new Error(`WebDAV auth failed (HTTP ${code})`);
  }
  return { ok: true, httpStatus: code };
}
