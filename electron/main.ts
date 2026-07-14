import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { CoreSupervisor } from "./core/supervisor";
import { loadSettings, updateSettings } from "./store/settings";
import {
  addProfileFromFile,
  addProfileFromUrl,
  deleteProfile,
  editProfile,
  loadProfilesState,
  readProfileYaml,
  renameProfile,
  saveProfileContent,
  setCurrentProfile,
  updateProfile,
  type ProfileEditPatch,
} from "./store/profiles";
// updateProfile used by auto-refresh scheduler
import {
  getConfigPath,
  getHomeDir,
  getMihomoPath,
  getProfilesDir,
  getSettingsPath,
  getProfilesStatePath,
} from "./store/paths";
import { disableSystemProxy, enableSystemProxy } from "./system/proxy-mac";
import { destroyTray, setupTray } from "./system/tray";
import { registerHotkeys, unregisterHotkeys } from "./system/hotkeys";
import type { AppSettings, ProxyMode, TrafficSnapshot } from "./shared/types";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const supervisor = new CoreSupervisor();
let isQuitting = false;
let trafficWs: WebSocket | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: "ClashNode",
    // Custom traffic lights; CSS -webkit-app-region:drag on top safe area
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor: "#fafafa",
    show: false,
    webPreferences: {
      // Built as CJS so require("electron") works in the preload sandbox
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("close", (e) => {
    const settings = loadSettings();
    if (!isQuitting && settings.minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

function broadcastState() {
  mainWindow?.webContents.send("core:state", supervisor.getState());
}

function startTrafficPoll() {
  stopTrafficPoll();
  const state = supervisor.getState();
  if (state.status !== "running") return;

  const headers: Record<string, string> = {};
  if (state.secret) headers.Authorization = `Bearer ${state.secret}`;

  try {
    trafficWs = new WebSocket(`ws://${state.controller}/traffic`, { headers });
    trafficWs.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw)) as TrafficSnapshot;
        mainWindow?.webContents.send("traffic:update", data);
      } catch {
        /* ignore */
      }
    });
    trafficWs.on("close", () => {
      trafficWs = null;
    });
    trafficWs.on("error", () => {
      trafficWs?.close();
      trafficWs = null;
    });
  } catch {
    /* ignore */
  }
}

function stopTrafficPoll() {
  if (trafficWs) {
    try {
      trafficWs.close();
    } catch {
      /* ignore */
    }
    trafficWs = null;
  }
}

async function syncSystemProxy(settings: AppSettings, running: boolean) {
  if (running && settings.systemProxy) {
    await enableSystemProxy(settings.mixedPort, settings.bypassDomains);
  } else {
    await disableSystemProxy();
  }
}

function applyHotkeysFromSettings(settings = loadSettings()) {
  registerHotkeys(settings.hotkeys, {
    getMainWindow: () => mainWindow,
    supervisor,
    startTraffic: startTrafficPoll,
    stopTraffic: stopTrafficPoll,
    broadcastState,
  });
}

function applyLoginItem(enabled: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });
  } catch {
    /* ignore on unsupported platforms */
  }
}

let profileUpdateTimer: NodeJS.Timeout | null = null;

async function refreshDueProfiles() {
  const settings = loadSettings();
  if (!settings.autoUpdateHours || settings.autoUpdateHours <= 0) return;
  const state = loadProfilesState();
  const maxAgeMs = settings.autoUpdateHours * 3600 * 1000;
  const now = Date.now();
  let changed = false;
  for (const p of state.items) {
    if (p.type !== "url" || !p.autoUpdate || !p.url) continue;
    const last = p.lastUpdated ? Date.parse(p.lastUpdated) : 0;
    if (now - last < maxAgeMs) continue;
    try {
      await updateProfile(p.id);
      changed = true;
      mainWindow?.webContents.send("core:log", {
        type: "info",
        payload: `[profiles] auto-updated ${p.name}`,
      });
    } catch (e) {
      mainWindow?.webContents.send("core:log", {
        type: "warning",
        payload: `[profiles] auto-update failed ${p.name}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }
  }
  if (changed && supervisor.getState().status === "running") {
    try {
      await supervisor.reloadConfig();
    } catch {
      /* ignore */
    }
  }
}

function scheduleProfileUpdates() {
  if (profileUpdateTimer) {
    clearInterval(profileUpdateTimer);
    profileUpdateTimer = null;
  }
  // Check every 30 minutes; individual profiles respect autoUpdateHours
  profileUpdateTimer = setInterval(
    () => {
      void refreshDueProfiles();
    },
    30 * 60 * 1000,
  );
  // Also run once shortly after launch
  setTimeout(() => {
    void refreshDueProfiles();
  }, 15_000);
}

function registerIpc() {
  ipcMain.handle("core:state", () => supervisor.getState());
  ipcMain.handle("core:start", async () => {
    const state = await supervisor.start();
    const settings = loadSettings();
    await syncSystemProxy(settings, state.status === "running");
    startTrafficPoll();
    return state;
  });
  ipcMain.handle("core:stop", async () => {
    const state = await supervisor.stop();
    await disableSystemProxy();
    stopTrafficPoll();
    return state;
  });
  ipcMain.handle("core:restart", async () => {
    const state = await supervisor.restart();
    const settings = loadSettings();
    await syncSystemProxy(settings, state.status === "running");
    startTrafficPoll();
    return state;
  });
  ipcMain.handle("core:reload", async () => supervisor.reloadConfig());

  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:update", async (_e, patch: Partial<AppSettings>) => {
    const prev = loadSettings();
    const next = updateSettings(patch);
    const running = supervisor.getState().status === "running";

    if (patch.startOnLaunch != null) {
      applyLoginItem(next.startOnLaunch);
    }

    if (patch.hotkeys != null) {
      applyHotkeysFromSettings(next);
    }

    if (
      patch.systemProxy != null ||
      patch.mixedPort != null ||
      patch.bypassDomains != null
    ) {
      await syncSystemProxy(next, running);
    }

    const needsCorePatch =
      patch.mode != null ||
      patch.logLevel != null ||
      patch.allowLan != null ||
      patch.mixedPort != null ||
      patch.tun != null ||
      patch.ipv6 != null ||
      patch.externalController != null;

    const needsDnsReload = patch.dns != null;

    if (needsCorePatch || needsDnsReload) {
      if (patch.tun && !prev.tun) {
        const auth = await supervisor.authorizeTunBinary();
        if (!auth.ok) {
          const rolled = updateSettings({ tun: false });
          mainWindow?.webContents.send("settings:changed", rolled);
          throw new Error(auth.message);
        }
      }
      if (needsDnsReload && running) {
        // DNS lives in full config YAML — rewrite + reload
        await supervisor.reloadConfig();
      } else if (needsCorePatch) {
        await supervisor.applySettings(next);
      } else if (needsDnsReload) {
        supervisor.writeRuntimeConfig(next);
      }
    }

    mainWindow?.webContents.send("settings:changed", next);
    return next;
  });

  ipcMain.handle("app:paths", () => ({
    home: getHomeDir(),
    config: getConfigPath(),
    profiles: getProfilesDir(),
    settings: getSettingsPath(),
    mihomo: getMihomoPath(),
  }));
  ipcMain.handle("app:open-path", async (_e, which: string) => {
    const map: Record<string, string> = {
      home: getHomeDir(),
      config: getConfigPath(),
      profiles: getProfilesDir(),
      settings: getSettingsPath(),
      mihomo: path.dirname(getMihomoPath()),
    };
    const target = map[which] ?? getHomeDir();
    const err = await shell.openPath(target);
    if (err) throw new Error(err);
    return true;
  });
  ipcMain.handle("app:show-item", (_e, which: string) => {
    const map: Record<string, string> = {
      home: getHomeDir(),
      config: getConfigPath(),
      profiles: getProfilesDir(),
      settings: getSettingsPath(),
      mihomo: getMihomoPath(),
    };
    const target = map[which] ?? getHomeDir();
    shell.showItemInFolder(target);
    return true;
  });
  ipcMain.handle("app:copy-text", (_e, text: string) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle("app:get-version", () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
  }));

  ipcMain.handle("profiles:list", () => loadProfilesState());
  ipcMain.handle(
    "profiles:add-url",
    async (_e, { url, name }: { url: string; name?: string }) => {
      const profile = await addProfileFromUrl(url, name);
      return profile;
    },
  );
  ipcMain.handle("profiles:add-file", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return addProfileFromFile(res.filePaths[0]);
  });
  ipcMain.handle("profiles:update", async (_e, id: string) => updateProfile(id));
  ipcMain.handle("profiles:delete", async (_e, id: string) => {
    const state = deleteProfile(id);
    await supervisor.reloadConfig();
    return state;
  });
  ipcMain.handle("profiles:set-current", async (_e, id: string | null) => {
    const state = setCurrentProfile(id);
    if (supervisor.getState().status === "running") {
      await supervisor.reloadConfig();
    } else {
      supervisor.writeRuntimeConfig();
    }
    return state;
  });
  ipcMain.handle(
    "profiles:rename",
    (_e, { id, name }: { id: string; name: string }) => renameProfile(id, name),
  );
  ipcMain.handle(
    "profiles:edit",
    (_e, { id, patch }: { id: string; patch: ProfileEditPatch }) =>
      editProfile(id, patch),
  );
  ipcMain.handle("profiles:content", (_e, id: string) => readProfileYaml(id));
  ipcMain.handle(
    "profiles:save-content",
    async (_e, { id, content }: { id: string; content: string }) => {
      const profile = saveProfileContent(id, content);
      const state = loadProfilesState();
      if (state.currentId === id && supervisor.getState().status === "running") {
        await supervisor.reloadConfig();
      } else if (state.currentId === id) {
        supervisor.writeRuntimeConfig();
      }
      return profile;
    },
  );
  ipcMain.handle("config:runtime", () => {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return "";
    return fs.readFileSync(p, "utf8");
  });
  ipcMain.handle("config:save-runtime", async (_e, content: string) => {
    fs.writeFileSync(getConfigPath(), content, "utf8");
    if (supervisor.getState().status === "running") {
      await supervisor.reloadConfig();
    }
  });

  const withApi = async <T>(fn: (api: ReturnType<CoreSupervisor["getApi"]>) => Promise<T>) => {
    return fn(supervisor.getApi());
  };

  ipcMain.handle("api:proxies", () => withApi((api) => api.proxies()));
  ipcMain.handle(
    "api:select-proxy",
    (_e, { group, name }: { group: string; name: string }) =>
      withApi((api) => api.selectProxy(group, name)),
  );
  ipcMain.handle("api:delay", (_e, name: string) => {
    const url = loadSettings().testUrl;
    return withApi((api) => api.delay(name, url));
  });
  ipcMain.handle("api:connections", () => withApi((api) => api.connections()));
  ipcMain.handle("api:close-connection", (_e, id: string) =>
    withApi((api) => api.closeConnection(id)),
  );
  ipcMain.handle("api:close-all-connections", () =>
    withApi((api) => api.closeAllConnections()),
  );
  ipcMain.handle("api:rules", () => withApi((api) => api.rules()));
  ipcMain.handle("api:providers", () => withApi((api) => api.providers()));
  ipcMain.handle("api:update-provider", (_e, name: string) =>
    withApi((api) => api.updateProvider(name)),
  );
  ipcMain.handle("api:set-mode", async (_e, mode: ProxyMode) => {
    updateSettings({ mode });
    await withApi((api) => api.setMode(mode));
    mainWindow?.webContents.send("settings:changed", loadSettings());
  });
  ipcMain.handle("api:patch-configs", (_e, body: Record<string, unknown>) =>
    withApi((api) => api.patchConfigs(body)),
  );
  ipcMain.handle("api:credentials", () => {
    const s = supervisor.getState();
    return { controller: s.controller, secret: s.secret };
  });

  ipcMain.handle("system:proxy", async (_e, enabled: boolean) => {
    const next = updateSettings({ systemProxy: enabled });
    await syncSystemProxy(next, supervisor.getState().status === "running");
    mainWindow?.webContents.send("settings:changed", next);
    return next;
  });
  ipcMain.handle("system:authorize-tun", () => supervisor.authorizeTunBinary());

  ipcMain.handle("backup:create", async () => {
    const res = await dialog.showSaveDialog({
      defaultPath: `clashnode-backup-${Date.now()}.zip`,
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (res.canceled || !res.filePath) return null;
    const home = getHomeDir();
    await zipDir(home, res.filePath);
    return res.filePath;
  });
  ipcMain.handle("backup:restore", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (res.canceled || !res.filePaths[0]) return false;
    await unzipTo(res.filePaths[0], getHomeDir());
    if (supervisor.getState().status === "running") {
      await supervisor.restart();
    }
    mainWindow?.webContents.send("settings:changed", loadSettings());
    return true;
  });
}

function zipDir(srcDir: string, outFile: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("zip", ["-r", outFile, "."], { cwd: srcDir });
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`zip failed: ${code}`)),
    );
  });
}

function unzipTo(zipFile: string, dest: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-o", zipFile, "-d", dest]);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`unzip failed: ${code}`)),
    );
  });
}

async function gracefulQuit() {
  if (isQuitting) return;
  isQuitting = true;
  stopTrafficPoll();
  unregisterHotkeys();
  try {
    await supervisor.stop(true);
  } catch {
    /* ignore */
  }
  try {
    await disableSystemProxy();
  } catch {
    /* ignore */
  }
  destroyTray();
  app.exit(0);
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  setupTray(supervisor, () => mainWindow, () => void gracefulQuit());

  supervisor.on("state", () => broadcastState());
  supervisor.on("log", (line) => {
    mainWindow?.webContents.send("core:log", line);
  });

  const settings = loadSettings();
  applyLoginItem(settings.startOnLaunch);
  applyHotkeysFromSettings(settings);
  scheduleProfileUpdates();

  try {
    supervisor.writeRuntimeConfig();
  } catch {
    /* ignore */
  }

  if (settings.autoStartCore) {
    void (async () => {
      try {
        const state = await supervisor.start();
        await syncSystemProxy(loadSettings(), state.status === "running");
        startTrafficPoll();
        broadcastState();
      } catch (e) {
        mainWindow?.webContents.send("core:log", {
          type: "error",
          payload: `[core] auto-start failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        });
      }
    })();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") void gracefulQuit();
});

app.on("before-quit", (e) => {
  if (!isQuitting) {
    e.preventDefault();
    void gracefulQuit();
  }
});

// silence unused path helpers lint for now
void getProfilesDir;
void getSettingsPath;
void getProfilesStatePath;
