import { BrowserWindow } from "electron";
// electron-updater is CJS; default import works under NodeNext with esModuleInterop
import pkg from "electron-updater";

const { autoUpdater } = pkg;

let initialized = false;

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info: { version: string; releaseNotes?: unknown }) => {
    getMainWindow()?.webContents.send("updater:available", {
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });
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

export async function checkForAppUpdates() {
  // No-op / soft gracefully when not packaged or publish not configured
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      version: result?.updateInfo?.version ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function downloadAppUpdate() {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function quitAndInstallUpdate() {
  autoUpdater.quitAndInstall();
}
