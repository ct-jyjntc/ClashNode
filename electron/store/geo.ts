import fs from "node:fs";
import path from "node:path";
import { GEO_DOWNLOADS, GEO_FILES, type GeoResourceFile } from "../shared/types";
import { getHomeDir, ensureDir } from "./paths";

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

export async function downloadGeoFile(name: string): Promise<GeoResourceFile> {
  const url = GEO_DOWNLOADS[name];
  if (!url) throw new Error(`Unknown geo file: ${name}`);
  const home = getHomeDir();
  ensureDir(home);
  const dest = path.join(home, name);
  const res = await fetch(url, {
    headers: { "User-Agent": "ClashNode/0.1" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  const st = fs.statSync(dest);
  return {
    name,
    path: dest,
    exists: true,
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

export async function downloadAllGeo(): Promise<GeoResourceFile[]> {
  const out: GeoResourceFile[] = [];
  for (const name of Object.keys(GEO_DOWNLOADS)) {
    try {
      out.push(await downloadGeoFile(name));
    } catch {
      out.push({
        name,
        path: path.join(getHomeDir(), name),
        exists: fs.existsSync(path.join(getHomeDir(), name)),
        size: 0,
      });
    }
  }
  return listGeoFiles();
}
