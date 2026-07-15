import fs from "node:fs";
import path from "node:path";
import {
  GEO_DOWNLOAD_MIRRORS,
  GEO_DOWNLOADS,
  GEO_FILES,
  type GeoResourceFile,
} from "../shared/types";
import { getHomeDir, ensureDir } from "./paths";

/** Minimum plausible size — reject truncated downloads. */
const MIN_GEO_SIZE: Record<string, number> = {
  "geoip.metadb": 100_000,
  "GeoIP.dat": 100_000,
  "GeoSite.dat": 100_000,
  "ASN.mmdb": 1_000_000,
  "country.mmdb": 1_000_000,
};

export function listGeoFiles(): GeoResourceFile[] {
  const home = getHomeDir();
  return GEO_FILES.map((name) => {
    const filePath = path.join(home, name);
    const exists = fs.existsSync(filePath);
    let size = 0;
    let mtime: string | undefined;
    if (exists) {
      const st = fs.statSync(filePath);
      size = st.size;
      mtime = st.mtime.toISOString();
    }
    return { name, path: filePath, exists, size, mtime };
  });
}

function isValidGeo(name: string, filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const st = fs.statSync(filePath);
    const min = MIN_GEO_SIZE[name] ?? 1024;
    return st.size >= min;
  } catch {
    return false;
  }
}

async function fetchToFile(
  url: string,
  dest: string,
  timeoutMs = 60_000,
): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ClashNode/0.1" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = `${dest}.download`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
  } finally {
    clearTimeout(timer);
  }
}

function urlsFor(name: string): string[] {
  const primary = GEO_DOWNLOADS[name];
  const mirrors = GEO_DOWNLOAD_MIRRORS[name] ?? [];
  return [primary, ...mirrors].filter(Boolean);
}

export async function downloadGeoFile(name: string): Promise<GeoResourceFile> {
  if (!GEO_DOWNLOADS[name]) throw new Error(`Unknown geo file: ${name}`);
  const home = getHomeDir();
  ensureDir(home);
  const dest = path.join(home, name);
  let lastErr = "";
  for (const url of urlsFor(name)) {
    try {
      await fetchToFile(url, dest, 90_000);
      if (!isValidGeo(name, dest)) {
        lastErr = `file too small after download from ${url}`;
        continue;
      }
      const st = fs.statSync(dest);
      return {
        name,
        path: dest,
        exists: true,
        size: st.size,
        mtime: st.mtime.toISOString(),
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Download failed for ${name}: ${lastErr}`);
}

export async function downloadAllGeo(): Promise<GeoResourceFile[]> {
  for (const name of Object.keys(GEO_DOWNLOADS)) {
    try {
      await downloadGeoFile(name);
    } catch {
      /* keep going */
    }
  }
  return listGeoFiles();
}

/**
 * Ensure geodata mihomo needs for a non-blocking start.
 * Missing/invalid MMDB makes `mihomo -t` hang while it tries GitHub.
 *
 * Downloads only critical files if absent; non-fatal on failure.
 */
export async function ensureCriticalGeo(opts?: {
  onLog?: (msg: string) => void;
}): Promise<{ ok: boolean; missing: string[] }> {
  const home = getHomeDir();
  ensureDir(home);
  // country.mmdb / geoip.metadb are what trigger "MMDB invalid, remove and download"
  const critical = ["geoip.metadb", "country.mmdb", "GeoSite.dat"] as const;
  const missing: string[] = [];

  for (const name of critical) {
    const p = path.join(home, name);
    if (isValidGeo(name, p)) continue;
    // Remove corrupt stubs so mihomo doesn't keep retrying a bad file forever
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    opts?.onLog?.(`[geo] downloading ${name}…`);
    try {
      await downloadGeoFile(name);
      opts?.onLog?.(`[geo] ${name} ready`);
    } catch (e) {
      missing.push(name);
      opts?.onLog?.(
        `[geo] ${name} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { ok: missing.length === 0, missing };
}
