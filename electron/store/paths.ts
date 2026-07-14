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

export function getMihomoPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", "mihomo");
  }
  // Dev: prefer project-root resources next to package.json
  const candidates = [
    path.join(app.getAppPath(), "resources", "bin", "mihomo"),
    path.join(process.cwd(), "resources", "bin", "mihomo"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../resources/bin/mihomo"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
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
