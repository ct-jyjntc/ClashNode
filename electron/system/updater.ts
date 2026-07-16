import { app, BrowserWindow, shell } from "electron";
// electron-updater is CJS; default import works under NodeNext with esModuleInterop
import pkg from "electron-updater";

const { autoUpdater } = pkg;

let initialized = false;

const GH_OWNER = "ct-jyjntc";
const GH_REPO = "ClashNode";
const GH_RELEASES_API = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`;
const GH_RELEASES_PAGE = `https://github.com/${GH_OWNER}/${GH_REPO}/releases`;

/** Short timeout — api.github.com usually works; release CDN often times out in CN. */
const CHECK_TIMEOUT_MS = 12_000;

type GithubRelease = {
  tag_name?: string;
  html_url?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
};

function ensureFeed() {
  autoUpdater.setFeedURL({
    provider: "github",
    owner: GH_OWNER,
    repo: GH_REPO,
    releaseType: "release",
  });
  if (!app.isPackaged) {
    // Allow checking against real GitHub releases in dev
    autoUpdater.forceDevUpdateConfig = true;
  }
}

function normalizeVersion(v: string | null | undefined): string {
  return (v || "").trim().replace(/^v/i, "");
}

function isNewerVersion(latest: string, current: string): boolean {
  if (!latest || !current) return false;
  if (latest === current) return false;
  const pa = latest.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = current.split(".").map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const a = pa[i] ?? 0;
    const b = pb[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(GH_RELEASES_API, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": `ClashNode/${app.getVersion()}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}`);
    }
    return (await res.json()) as GithubRelease;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `检查超时（${CHECK_TIMEOUT_MS / 1000}s）。请检查网络或稍后重试；也可打开 ${GH_RELEASES_PAGE}`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  ensureFeed();

  autoUpdater.on(
    "update-available",
    (info: { version: string; releaseNotes?: unknown }) => {
      getMainWindow()?.webContents.send("updater:available", {
        version: info.version,
        releaseNotes: info.releaseNotes ?? null,
      });
    },
  );
  autoUpdater.on("update-not-available", () => {
    getMainWindow()?.webContents.send("updater:not-available");
  });
  autoUpdater.on("error", (err: Error) => {
    getMainWindow()?.webContents.send("updater:error", err.message);
  });
  autoUpdater.on(
    "download-progress",
    (p: { percent: number; transferred: number; total: number }) => {
      getMainWindow()?.webContents.send("updater:progress", {
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
      });
    },
  );
  autoUpdater.on("update-downloaded", (info: { version: string }) => {
    getMainWindow()?.webContents.send("updater:downloaded", {
      version: info.version,
    });
  });
}

/**
 * Check for app updates via GitHub Releases API (same path as core update).
 * Avoid electron-updater's first-hop CDN fetch which often times out in CN.
 */
export async function checkForAppUpdates() {
  const current = normalizeVersion(app.getVersion());
  const feed = `github:${GH_OWNER}/${GH_REPO}`;
  try {
    const data = await fetchLatestRelease();
    const latest = normalizeVersion(data.tag_name);
    const htmlUrl = data.html_url || GH_RELEASES_PAGE;
    const hasUpdate = isNewerVersion(latest, current);

    return {
      ok: true as const,
      version: latest || null,
      current,
      hasUpdate,
      htmlUrl,
      feed,
    };
  } catch (e) {
    // Last resort: try electron-updater (may still timeout on CDN)
    try {
      ensureFeed();
      const result = await Promise.race([
        autoUpdater.checkForUpdates(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("electron-updater check timed out")),
            CHECK_TIMEOUT_MS,
          ),
        ),
      ]);
      const latest = normalizeVersion(result?.updateInfo?.version);
      return {
        ok: true as const,
        version: latest || null,
        current,
        hasUpdate: isNewerVersion(latest, current),
        htmlUrl: GH_RELEASES_PAGE,
        feed,
      };
    } catch {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
        current,
        feed,
        htmlUrl: GH_RELEASES_PAGE,
      };
    }
  }
}

export async function downloadAppUpdate() {
  try {
    ensureFeed();
    // electron-updater download hits release CDN — wrap with timeout message
    await Promise.race([
      autoUpdater.downloadUpdate(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "下载超时。请从 GitHub Release 手动下载安装包。",
              ),
            ),
          120_000,
        ),
      ),
    ]);
    return { ok: true as const };
  } catch (e) {
    // Fallback: open releases page so user can download dmg manually
    try {
      await shell.openExternal(GH_RELEASES_PAGE);
    } catch {
      /* ignore */
    }
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
      htmlUrl: GH_RELEASES_PAGE,
    };
  }
}

export function quitAndInstallUpdate() {
  autoUpdater.quitAndInstall();
}

export async function openAppReleasesPage() {
  await shell.openExternal(GH_RELEASES_PAGE);
  return true;
}
