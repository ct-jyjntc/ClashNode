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

/** Prefer platform-tagged names when present (for multi-arch packs). */
function mihomoCandidates(baseDir: string) {
  const name = mihomoBinaryName();
  const arch = process.arch; // arm64 | x64 | ...
  const plat =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "windows"
        : "linux";
  return [
    path.join(baseDir, name),
    path.join(baseDir, `mihomo-${plat}-${arch}${process.platform === "win32" ? ".exe" : ""}`),
    path.join(baseDir, `mihomo-${plat}-arm64`),
    path.join(baseDir, `mihomo-${plat}-amd64`),
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
  if (!app.isPackaged) return bundled;
  if (!fs.existsSync(bundled)) return bundled;

  const workDir = path.join(app.getPath("userData"), "bin");
  ensureDir(workDir);
  const work = path.join(workDir, mihomoBinaryName());

  try {
    if (fs.existsSync(work)) {
      const st = fs.statSync(work);
      // Keep an already-elevated setuid binary
      if ((st.mode & 0o4000) !== 0) return work;
      const srcMtime = fs.statSync(bundled).mtimeMs;
      if (srcMtime <= st.mtimeMs) return work;
    }
    fs.copyFileSync(bundled, work);
    fs.chmodSync(work, 0o755);
    return work;
  } catch {
    return bundled;
  }
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
