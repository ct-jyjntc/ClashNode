import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function getHomeDir() {
  const dir = path.join(app.getPath("userData"));
  ensureDir(dir);
  ensureDir(path.join(dir, "profiles"));
  ensureDir(path.join(dir, "backups"));
  return dir;
}

export function getProfilesDir() {
  return path.join(getHomeDir(), "profiles");
}

export function getConfigPath() {
  return path.join(getHomeDir(), "config.yaml");
}

export function getSettingsPath() {
  return path.join(getHomeDir(), "settings.json");
}

export function getProfilesStatePath() {
  return path.join(getHomeDir(), "profiles.json");
}

export function getSecretPath() {
  return path.join(getHomeDir(), "secret.txt");
}

function mihomoBinaryName() {
  if (process.platform === "win32") return "mihomo.exe";
  return "mihomo";
}

/**
 * Prefer platform-tagged names when present (for multi-arch packs).
 *   mihomo, mihomo.exe
 *   mihomo-darwin-arm64 / mihomo-darwin-amd64
 *   mihomo-windows-amd64.exe / mihomo-windows-arm64.exe
 */
function mihomoCandidates(baseDir: string) {
  const name = mihomoBinaryName();
  const arch = process.arch; // arm64 | x64 | ia32 | ...
  const plat = process.platform === "win32" ? "windows" : "darwin";
  const archAlias =
    arch === "x64" ? "amd64" : arch === "ia32" ? "386" : arch;
  const ext = process.platform === "win32" ? ".exe" : "";
  // Prefer platform-tagged binaries first — multi-arch packs ship every OS
  // binary under resources/bin, so plain "mihomo" may be the wrong platform.
  return [
    path.join(baseDir, `mihomo-${plat}-${arch}${ext}`),
    path.join(baseDir, `mihomo-${plat}-${archAlias}${ext}`),
    path.join(baseDir, `mihomo-${plat}-arm64${ext}`),
    path.join(baseDir, `mihomo-${plat}-amd64${ext}`),
    path.join(baseDir, `mihomo-${plat}-x64${ext}`),
    path.join(baseDir, plat, name),
    path.join(baseDir, plat, `${arch}`, name),
    path.join(baseDir, plat, `${archAlias}`, name),
    path.join(baseDir, name),
  ];
}

function resolveBundledMihomoPath() {
  if (app.isPackaged) {
    const dir = path.join(process.resourcesPath, "bin");
    for (const p of mihomoCandidates(dir)) {
      if (fs.existsSync(p)) return p;
    }
    return path.join(dir, mihomoBinaryName());
  }
  const bases = [
    path.join(app.getAppPath(), "resources", "bin"),
    path.join(process.cwd(), "resources", "bin"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/bin"),
  ];
  for (const dir of bases) {
    for (const p of mihomoCandidates(dir)) {
      if (fs.existsSync(p)) return p;
    }
  }
  return path.join(bases[0], mihomoBinaryName());
}

/**
 * Runtime path for mihomo.
 * When packaged, copy the bundled binary into userData/bin so TUN setuid
 * (chown/chmod +sx) can succeed without mutating the .app bundle.
 */
export function getMihomoPath() {
  const bundled = resolveBundledMihomoPath();
  // Dev: use tagged binary if plain name missing
  if (!app.isPackaged) {
    if (fs.existsSync(bundled)) return bundled;
    // still try candidates under resources/bin
    return bundled;
  }
  if (!fs.existsSync(bundled)) return bundled;

  // Packaged: copy into userData so we can setuid (unix) / unblock (windows)
  // without mutating the install tree.
  const workDir = path.join(app.getPath("userData"), "bin");
  ensureDir(workDir);
  const work = path.join(workDir, mihomoBinaryName());

  try {
    if (fs.existsSync(work)) {
      const st = fs.statSync(work);
      // Keep an already-elevated setuid binary (macOS)
      if ((st.mode & 0o4000) !== 0) {
        ensureWintunBesideMihomo(work);
        return work;
      }
      const srcMtime = fs.statSync(bundled).mtimeMs;
      if (srcMtime <= st.mtimeMs) {
        ensureWintunBesideMihomo(work);
        return work;
      }
    }
    fs.copyFileSync(bundled, work);
    try {
      fs.chmodSync(work, 0o755);
    } catch {
      /* windows may not chmod */
    }
    ensureWintunBesideMihomo(work);
    return work;
  } catch {
    return bundled;
  }
}

/** Bundled resource bin directories (packaged + dev). */
export function getResourceBinDirs(): string[] {
  if (app.isPackaged) {
    return [path.join(process.resourcesPath, "bin")];
  }
  return [
    path.join(app.getAppPath(), "resources", "bin"),
    path.join(process.cwd(), "resources", "bin"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/bin"),
  ];
}

/**
 * Copy wintun.dll next to the mihomo binary (required for Windows TUN).
 * Prefers arch-tagged names: wintun-amd64.dll / wintun-arm64.dll → wintun.dll
 */
export function ensureWintunBesideMihomo(
  mihomoPath: string,
): { ok: boolean; message: string; dest?: string } {
  if (process.platform !== "win32") {
    return { ok: true, message: "not windows" };
  }
  const dir = path.dirname(mihomoPath);
  const dest = path.join(dir, "wintun.dll");
  if (fs.existsSync(dest)) {
    return { ok: true, message: "wintun.dll present", dest };
  }

  const arch = process.arch; // x64 | arm64 | …
  const archAlias = arch === "x64" ? "amd64" : arch;
  const names = [
    `wintun-${archAlias}.dll`,
    `wintun-${arch}.dll`,
    "wintun.dll",
    "wintun-amd64.dll",
    "wintun-arm64.dll",
  ];

  for (const base of getResourceBinDirs()) {
    for (const n of names) {
      const src = path.join(base, n);
      if (!fs.existsSync(src)) continue;
      try {
        ensureDir(dir);
        fs.copyFileSync(src, dest);
        return { ok: true, message: `copied ${n}`, dest };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  return {
    ok: false,
    message:
      "wintun.dll not found. Run: bash scripts/fetch-wintun.sh  (or place wintun.dll under resources/bin)",
  };
}

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}
