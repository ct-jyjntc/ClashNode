import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { CoreSupervisor } from "./core/supervisor";
import { mergeConfig } from "./core/config-merger";
import { loadSettings, updateSettings } from "./store/settings";
import {
  addProfileFromFile,
  addProfileFromUrl,
  deleteProfile,
  editProfile,
  loadProfilesState,
  readProfileYaml,
  renameProfile,
  reorderProfiles,
  saveProfileContent,
  setCurrentProfile,
  saveProfilesState,
  setAppendRules,
  setCustomProxies,
  setCustomProxyGroups,
  setCustomProxyProviders,
  setCustomRules,
  setPrependRules,
  setProfileScript,
  setSelectedProxy,
  updateProfile,
  type ProfileEditPatch,
} from "./store/profiles";
import {
  createScript,
  deleteScript,
  listScripts,
  readScriptContent,
  renameScript,
  saveScriptContent,
  DEFAULT_SCRIPT,
} from "./store/scripts";
import {
  getConfigPath,
  getHomeDir,
  getMihomoBinaryVersion,
  getMihomoPath,
  getProfilesDir,
  getSettingsPath,
  getProfilesStatePath,
} from "./store/paths";
import { downloadAllGeo, downloadGeoFile, listGeoFiles } from "./store/geo";
import {
  webdavDownloadBackup,
  webdavTest,
  webdavUploadBackup,
} from "./store/webdav";
import {
  disableSystemProxy,
  enableSystemProxy,
  applySystemDns,
  restoreSystemDns,
} from "./system/proxy";
import {
  destroyTray,
  scheduleTrayRebuild,
  setTrayTraffic,
  setupTray,
} from "./system/tray";
import { registerHotkeys, unregisterHotkeys } from "./system/hotkeys";
import {
  startOnDemandMonitor,
  stopOnDemandMonitor,
} from "./system/connectivity";
import {
  checkForAppUpdates,
  downloadAppUpdate,
  quitAndInstallUpdate,
  setupAutoUpdater,
} from "./system/updater";
import { applyLoginItem } from "./system/autolaunch";
import { registerDefaultProtocols } from "./system/protocol";
import { openEnableLoopback } from "./system/helper";
import { zipDirectory, unzipToDirectory } from "./store/archive";
import type {
  AppSettings,
  CustomProxyGroup,
  ProxyMode,
  RequestItem,
  TrafficSnapshot,
} from "./shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const supervisor = new CoreSupervisor();
let isQuitting = false;
let trafficWs: WebSocket | null = null;
let connectionsWs: WebSocket | null = null;
const requestRing: RequestItem[] = [];
const MAX_REQUESTS = 500;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

async function handleDeepLink(raw: string) {
  try {
    const url = new URL(raw);
    // clash://install-config?url=...  or clashnode://import?url=...
    const sub =
      url.searchParams.get("url") ||
      url.searchParams.get("config") ||
      (url.pathname.startsWith("http") ? url.pathname : "");
    if (sub && /^https?:\/\//i.test(decodeURIComponent(sub))) {
      const target = decodeURIComponent(sub);
      await addProfileFromUrl(target);
      mainWindow?.webContents.send("core:log", {
        type: "info",
        payload: `[deeplink] imported ${target}`,
      });
      mainWindow?.show();
      mainWindow?.focus();
      return;
    }
  } catch (e) {
    mainWindow?.webContents.send("core:log", {
      type: "warning",
      payload: `[deeplink] ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

app.on("second-instance", (_e, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  const link = argv.find(
    (a) => a.startsWith("clash://") || a.startsWith("clashnode://"),
  );
  if (link) void handleDeepLink(link);
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  void handleDeepLink(url);
});

/** Resolve packaged / dev path for icon assets. */
function iconAssetPath(...parts: string[]) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icons", ...parts);
  }
  const candidates = [
    path.join(process.cwd(), "resources", "icons", ...parts),
    path.join(app.getAppPath(), "resources", "icons", ...parts),
    path.join(__dirname, "../../resources/icons", ...parts),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/**
 * Appearance-aware Dock icon.
 *
 * Grid matches FlClash AppIcon.appiconset: 1024 canvas, ~82% rounded plate,
 * transparent outer margin (mid-edge alpha = 0). See scripts/generate-icons.sh.
 * Packaged `.icns` is the same art; setDockIcon swaps light/dark PNGs because
 * Electron cannot ship dual-appearance `.icns` / Icon Composer `.icon`.
 */
function applyAppIconForTheme(dark?: boolean) {
  const isDark = dark ?? nativeTheme.shouldUseDarkColors;
  const dockName = isDark ? "dock-dark.png" : "dock-light.png";
  const fallbacks = [
    iconAssetPath(dockName),
    iconAssetPath(isDark ? "icon-dark.png" : "icon-light.png"),
    // Packaged default (single appearance) when theme-specific PNGs missing
    iconAssetPath("icon.icns"),
    iconAssetPath("icon.png"),
  ];
  let img: Electron.NativeImage | null = null;
  for (const p of fallbacks) {
    if (!fs.existsSync(p)) continue;
    try {
      const next = nativeImage.createFromPath(p);
      if (!next.isEmpty()) {
        img = next;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!img) return;

  if (process.platform === "darwin") {
    try {
      app.dock?.setIcon(img);
    } catch {
      /* ignore */
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setIcon(img);
    } catch {
      /* ignore on macOS without setIcon */
    }
  }
}

function createWindow() {
  const isDark = nativeTheme.shouldUseDarkColors;
  const windowIcon =
    iconAssetPath(isDark ? "dock-dark.png" : "dock-light.png");
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  const bg = isDark ? "#0f0f0f" : "#fafafa";

  mainWindow = new BrowserWindow({
    width: 1111,
    height: 780,
    minWidth: 1111,
    minHeight: 780,
    title: "ClashNode",
    backgroundColor: bg,
    icon: fs.existsSync(windowIcon) ? windowIcon : undefined,
    show: false,
    // macOS: hiddenInset + traffic lights (sidebar pads left for them).
    // Windows: hidden title bar + overlay caption buttons on the right
    //          (no left chrome — sidebar toggle sits flush-left).
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 12 },
        }
      : isWin
        ? {
            titleBarStyle: "hidden" as const,
            titleBarOverlay: {
              color: bg,
              symbolColor: isDark ? "#fafafa" : "#111111",
              height: 40,
            },
          }
        : {
            titleBarStyle: "hidden" as const,
          }),
    webPreferences: {
      // Built as CJS so require("electron") works in the preload sandbox
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  applyAppIconForTheme(isDark);

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
        setTrayTraffic(data.up ?? 0, data.down ?? 0);
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

  // Track connection snapshots → request feed
  try {
    connectionsWs = new WebSocket(
      `ws://${state.controller}/connections?interval=1000`,
      { headers },
    );
    const seen = new Set<string>();
    connectionsWs.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw)) as {
          connections?: Array<{
            id: string;
            upload: number;
            download: number;
            start: string;
            chains: string[];
            rule: string;
            rulePayload?: string;
            metadata?: Record<string, string>;
          }>;
        };
        for (const c of data.connections ?? []) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          const item: RequestItem = {
            id: c.id,
            time: c.start || new Date().toISOString(),
            host:
              c.metadata?.host ||
              `${c.metadata?.destinationIP ?? ""}:${c.metadata?.destinationPort ?? ""}`,
            process: c.metadata?.process,
            rule: c.rule,
            rulePayload: c.rulePayload,
            chains: c.chains ?? [],
            network: c.metadata?.network,
            type: c.metadata?.type,
            upload: c.upload,
            download: c.download,
          };
          requestRing.unshift(item);
          if (requestRing.length > MAX_REQUESTS) requestRing.pop();
          mainWindow?.webContents.send("requests:item", item);
        }
        // prevent unbounded seen set
        if (seen.size > 5000) seen.clear();
      } catch {
        /* ignore */
      }
    });
    connectionsWs.on("close", () => {
      connectionsWs = null;
    });
    connectionsWs.on("error", () => {
      connectionsWs?.close();
      connectionsWs = null;
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
  if (connectionsWs) {
    try {
      connectionsWs.close();
    } catch {
      /* ignore */
    }
    connectionsWs = null;
  }
}

/** Apply system proxy; never throws (logged via core:log). */
async function syncSystemProxy(settings: AppSettings, running: boolean) {
  try {
    if (running && settings.systemProxy) {
      await enableSystemProxy(settings.mixedPort, settings.bypassDomains);
    } else {
      await disableSystemProxy();
    }
  } catch (e) {
    mainWindow?.webContents.send("core:log", {
      type: "warning",
      payload: `[proxy] ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

/** Fire-and-forget system proxy so IPC returns immediately (FlClash style). */
function syncSystemProxyBackground(settings: AppSettings, running: boolean) {
  void syncSystemProxy(settings, running);
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
    // Emit starting early so UI flips without waiting for mihomo ready
    broadcastState();
    const state = await supervisor.start();
    const settings = loadSettings();
    // Don't block start IPC on networksetup (biggest latency source)
    syncSystemProxyBackground(settings, state.status === "running");
    startTrafficPoll();
    broadcastState();
    return state;
  });
  ipcMain.handle("core:stop", async () => {
    broadcastState();
    const state = await supervisor.stop();
    // Disable proxy in background; UI already sees stopped via state event
    void disableSystemProxy().catch(() => undefined);
    stopTrafficPoll();
    broadcastState();
    return state;
  });
  ipcMain.handle("core:restart", async () => {
    broadcastState();
    const state = await supervisor.restart();
    const settings = loadSettings();
    syncSystemProxyBackground(settings, state.status === "running");
    startTrafficPoll();
    broadcastState();
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

    if (
      patch.showTrayTitle != null ||
      patch.systemProxy != null ||
      patch.tun != null ||
      patch.mode != null ||
      patch.startOnLaunch != null ||
      patch.mixedPort != null
    ) {
      scheduleTrayRebuild();
    }

    if (patch.hotkeys != null) {
      applyHotkeysFromSettings(next);
    }

    if (patch.onDemand != null) {
      startOnDemandMonitor(supervisor, (msg) => {
        mainWindow?.webContents.send("core:log", {
          type: "info",
          payload: msg,
        });
      });
    }

    if (
      patch.systemProxy != null ||
      patch.mixedPort != null ||
      patch.bypassDomains != null
    ) {
      syncSystemProxyBackground(next, running);
    }

    if (patch.systemDns != null) {
      try {
        if (next.systemDns.enabled) {
          await applySystemDns(next.systemDns.servers);
        } else {
          await restoreSystemDns();
        }
      } catch (e) {
        mainWindow?.webContents.send("core:log", {
          type: "warning",
          payload: `[dns] ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    const needsCorePatch =
      patch.mode != null ||
      patch.logLevel != null ||
      patch.allowLan != null ||
      patch.mixedPort != null ||
      patch.tun != null ||
      patch.ipv6 != null ||
      patch.externalController != null;

    const needsFullReload =
      patch.dns != null ||
      patch.ports != null ||
      patch.hosts != null ||
      patch.geoxUrl != null ||
      patch.keepAliveInterval != null ||
      patch.geodataLoader != null ||
      patch.globalUa != null ||
      patch.unifiedDelay != null ||
      patch.tcpConcurrent != null ||
      patch.findProcessMode != null ||
      patch.globalPrependRules != null;

    if (needsCorePatch || needsFullReload) {
      // FlClash flow for TUN:
      // 1) authorizeCore (setuid on binary) if enabling
      // 2) restartCore so the new process runs with euid=0
      // 3) then apply config with tun.enable
      // Hot-patching TUN on an already-running non-root process → EPERM.
      if (patch.tun === true && !prev.tun) {
        const auth = await supervisor.authorizeTunBinary();
        if (!auth.ok) {
          const rolled = updateSettings({ tun: false });
          mainWindow?.webContents.send("settings:changed", rolled);
          throw new Error(auth.message);
        }
        if (running) {
          await supervisor.writeRuntimeConfig(next);
          await supervisor.restart();
          startTrafficPoll();
          broadcastState();
        } else {
          await supervisor.writeRuntimeConfig(next);
        }
      } else if (patch.tun === false && prev.tun) {
        // Disable TUN: restart with tun off (clean teardown of utun)
        if (running) {
          await supervisor.writeRuntimeConfig(next);
          await supervisor.restart();
          startTrafficPoll();
          broadcastState();
        } else {
          await supervisor.writeRuntimeConfig(next);
        }
      } else if (needsFullReload && running) {
        // DNS / classic ports live in full config YAML — rewrite + reload
        await supervisor.reloadConfig();
      } else if (needsCorePatch) {
        await supervisor.applySettings(next);
      } else if (needsFullReload) {
        await supervisor.writeRuntimeConfig(next);
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
      await supervisor.writeRuntimeConfig();
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
        await supervisor.writeRuntimeConfig();
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
    async (_e, { group, name }: { group: string; name: string }) => {
      await withApi((api) => api.selectProxy(group, name));
      const st = loadProfilesState();
      if (st.currentId) {
        setSelectedProxy(st.currentId, group, name);
      }
    },
  );
  ipcMain.handle("api:delay", async (_e, name: string) => {
    // Node latency tests often 503/504 — return 0 instead of throwing so
    // Electron doesn't spam "Error occurred in handler for 'api:delay'".
    try {
      const url = loadSettings().testUrl;
      return await withApi((api) => api.delay(name, url));
    } catch {
      return { delay: 0 };
    }
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
  ipcMain.handle("api:healthcheck-provider", (_e, name: string) =>
    withApi((api) => api.healthcheckProvider(name)),
  );
  ipcMain.handle("api:flush-fakeip", () => withApi((api) => api.flushFakeIp()));
  ipcMain.handle("api:flush-dns", () => withApi((api) => api.flushDns()));
  ipcMain.handle("api:upgrade-geo", () => withApi((api) => api.upgradeGeo()));
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

  ipcMain.handle("requests:list", () => requestRing.slice(0, MAX_REQUESTS));
  ipcMain.handle("requests:clear", () => {
    requestRing.length = 0;
    return true;
  });

  ipcMain.handle("profiles:set-prepend-rules", async (_e, { id, rules }: { id: string; rules: string[] }) => {
    const p = setPrependRules(id, rules);
    const st = loadProfilesState();
    if (st.currentId === id) {
      if (supervisor.getState().status === "running") {
        await supervisor.reloadConfig();
        const cur = st.items.find((x) => x.id === id);
        if (cur?.selectedMap) await supervisor.applySelectedMap(cur.selectedMap);
      } else {
        await supervisor.writeRuntimeConfig();
      }
    }
    return p;
  });
  ipcMain.handle("profiles:reorder", (_e, ids: string[]) => reorderProfiles(ids));
  ipcMain.handle("profiles:merged-preview", async (_e, id?: string) => {
    const st = loadProfilesState();
    const pid = id || st.currentId;
    const settings = loadSettings();
    const secret = supervisor.getState().secret;
    if (!pid) {
      const { yaml: text } = await mergeConfig(null, settings, secret);
      return text;
    }
    const profile = st.items.find((p) => p.id === pid);
    const yaml = readProfileYaml(pid);
    const prepend =
      profile?.customRules?.length
        ? profile.customRules
        : profile?.prependRules;
    const { yaml: text } = await mergeConfig(yaml, settings, secret, {
      prependRules: prepend,
      appendRules: profile?.appendRules,
      scriptId: profile?.scriptId,
      customProxyGroups: profile?.customProxyGroups,
      customProxies: profile?.customProxies,
      customProxyProviders: profile?.customProxyProviders,
      globalPrependRules: settings.globalPrependRules,
    });
    return text;
  });
  ipcMain.handle(
    "profiles:set-script",
    async (_e, { id, scriptId }: { id: string; scriptId: string | null }) => {
      const next = setProfileScript(id, scriptId);
      const st = loadProfilesState();
      if (st.currentId === id) {
        if (supervisor.getState().status === "running") {
          await supervisor.reloadConfig();
        } else {
          await supervisor.writeRuntimeConfig();
        }
      }
      return next;
    },
  );
  ipcMain.handle(
    "profiles:set-custom-groups",
    async (
      _e,
      { id, groups }: { id: string; groups: CustomProxyGroup[] },
    ) => {
      const next = setCustomProxyGroups(id, groups);
      const st = loadProfilesState();
      if (st.currentId === id) {
        if (supervisor.getState().status === "running") {
          await supervisor.reloadConfig();
          if (next.selectedMap) await supervisor.applySelectedMap(next.selectedMap);
        } else {
          await supervisor.writeRuntimeConfig();
        }
      }
      return next;
    },
  );
  ipcMain.handle(
    "profiles:set-custom-rules",
    async (_e, { id, rules }: { id: string; rules: string[] }) => {
      const next = setCustomRules(id, rules);
      const st = loadProfilesState();
      if (st.currentId === id) {
        if (supervisor.getState().status === "running") {
          await supervisor.reloadConfig();
          if (next.selectedMap) await supervisor.applySelectedMap(next.selectedMap);
        } else {
          await supervisor.writeRuntimeConfig();
        }
      }
      return next;
    },
  );
  ipcMain.handle(
    "profiles:set-append-rules",
    async (_e, { id, rules }: { id: string; rules: string[] }) => {
      const next = setAppendRules(id, rules);
      const st = loadProfilesState();
      if (st.currentId === id) {
        if (supervisor.getState().status === "running") {
          await supervisor.reloadConfig();
          if (next.selectedMap) await supervisor.applySelectedMap(next.selectedMap);
        } else {
          await supervisor.writeRuntimeConfig();
        }
      }
      return next;
    },
  );
  ipcMain.handle(
    "profiles:set-custom-proxies",
    async (
      _e,
      { id, proxies }: { id: string; proxies: Array<Record<string, unknown>> },
    ) => {
      const next = setCustomProxies(id, proxies);
      const st = loadProfilesState();
      if (st.currentId === id) {
        if (supervisor.getState().status === "running") {
          await supervisor.reloadConfig();
          if (next.selectedMap) await supervisor.applySelectedMap(next.selectedMap);
        } else {
          await supervisor.writeRuntimeConfig();
        }
      }
      return next;
    },
  );
  ipcMain.handle(
    "profiles:set-custom-proxy-providers",
    async (
      _e,
      {
        id,
        providers,
      }: { id: string; providers: Record<string, Record<string, unknown>> },
    ) => {
      const next = setCustomProxyProviders(id, providers);
      const st = loadProfilesState();
      if (st.currentId === id) {
        if (supervisor.getState().status === "running") {
          await supervisor.reloadConfig();
          if (next.selectedMap) await supervisor.applySelectedMap(next.selectedMap);
        } else {
          await supervisor.writeRuntimeConfig();
        }
      }
      return next;
    },
  );

  ipcMain.handle("scripts:list", () => listScripts());
  ipcMain.handle("scripts:create", (_e, name?: string) => createScript(name));
  ipcMain.handle(
    "scripts:rename",
    (_e, { id, name }: { id: string; name: string }) => renameScript(id, name),
  );
  ipcMain.handle("scripts:content", (_e, id: string) => readScriptContent(id));
  ipcMain.handle(
    "scripts:save",
    (_e, { id, content }: { id: string; content: string }) =>
      saveScriptContent(id, content),
  );
  ipcMain.handle("scripts:delete", (_e, id: string) => {
    const st = loadProfilesState();
    let changed = false;
    for (const p of st.items) {
      if (p.scriptId === id) {
        p.scriptId = null;
        changed = true;
      }
    }
    if (changed) saveProfilesState(st);
    return deleteScript(id);
  });
  ipcMain.handle("scripts:default", () => DEFAULT_SCRIPT);
  ipcMain.handle("profiles:import-clipboard", async () => {
    const text = clipboard.readText().trim();
    if (!text) throw new Error("Clipboard is empty");
    if (/^https?:\/\//i.test(text)) {
      const profile = await addProfileFromUrl(text);
      return { type: "url" as const, profile };
    }
    // treat as yaml content
    const tmp = path.join(getHomeDir(), `clipboard-${Date.now()}.yaml`);
    fs.writeFileSync(tmp, text, "utf8");
    try {
      const profile = await addProfileFromFile(tmp, "Clipboard");
      return { type: "file" as const, profile };
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });

  ipcMain.handle("geo:list", () => listGeoFiles());
  ipcMain.handle("geo:download", (_e, name: string) => downloadGeoFile(name));
  ipcMain.handle("geo:download-all", () => downloadAllGeo());

  ipcMain.handle("webdav:test", () => webdavTest(loadSettings().webdav));
  ipcMain.handle("webdav:upload", () =>
    webdavUploadBackup(loadSettings().webdav),
  );
  ipcMain.handle("webdav:download", async () => {
    await webdavDownloadBackup(loadSettings().webdav);
    if (supervisor.getState().status === "running") {
      await supervisor.restart();
    }
    mainWindow?.webContents.send("settings:changed", loadSettings());
    return true;
  });

  ipcMain.handle("system:proxy", async (_e, enabled: boolean) => {
    // Optimistic: push settings first so Switch flips immediately (FlClash)
    const next = updateSettings({ systemProxy: enabled });
    mainWindow?.webContents.send("settings:changed", next);
    const running = supervisor.getState().status === "running";
    // Apply networksetup without blocking the IPC reply
    syncSystemProxyBackground(next, running);
    return next;
  });
  ipcMain.handle("system:authorize-tun", () => supervisor.authorizeTunBinary());
  ipcMain.handle("system:enable-loopback", () => openEnableLoopback());
  ipcMain.handle("system:copy-proxy-env", () => {
    const s = loadSettings();
    const host = "127.0.0.1";
    const port = s.mixedPort;
    const text = [
      `export https_proxy=http://${host}:${port} http_proxy=http://${host}:${port} all_proxy=socks5://${host}:${port}`,
      `export HTTPS_PROXY=http://${host}:${port} HTTP_PROXY=http://${host}:${port} ALL_PROXY=socks5://${host}:${port}`,
    ].join("\n");
    clipboard.writeText(text);
    return text;
  });

  ipcMain.handle("system:public-ip", async () => {
    const endpoints = [
      "https://api.ipify.org?format=text",
      "https://ifconfig.me/ip",
      "https://icanhazip.com",
    ];
    for (const url of endpoints) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) continue;
        const ip = (await res.text()).trim();
        if (ip && ip.length < 64) return { ok: true as const, ip };
      } catch {
        /* try next */
      }
    }
    return { ok: false as const, error: "Failed to resolve public IP" };
  });

  ipcMain.handle("system:network-check", async () => {
    const s = loadSettings();
    const url = s.testUrl || "https://www.gstatic.com/generate_204";
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return {
        ok: res.status >= 200 && res.status < 500,
        ms: Date.now() - started,
        status: res.status,
      };
    } catch (e) {
      return {
        ok: false,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(
    "system:dns",
    async (_e, enabled: boolean, servers?: string[]) => {
      if (enabled) {
        const list =
          servers?.length ? servers : loadSettings().systemDns.servers;
        await applySystemDns(list);
        return updateSettings({
          systemDns: { enabled: true, servers: list },
        });
      }
      await restoreSystemDns();
      const prev = loadSettings();
      return updateSettings({
        systemDns: { ...prev.systemDns, enabled: false },
      });
    },
  );

  ipcMain.handle("app:open-devtools", () => {
    mainWindow?.webContents.openDevTools({ mode: "detach" });
    return true;
  });

  ipcMain.handle(
    "app:save-text",
    async (
      _e,
      { content, defaultPath }: { content: string; defaultPath?: string },
    ) => {
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: defaultPath || "clashnode-export.txt",
        filters: [
          { name: "Text", extensions: ["txt", "log", "yaml", "yml", "json"] },
          { name: "All", extensions: ["*"] },
        ],
      });
      if (result.canceled || !result.filePath) return null;
      fs.writeFileSync(result.filePath, content ?? "", "utf8");
      return result.filePath;
    },
  );

  ipcMain.handle("app:check-update", async () => {
    const current = app.getVersion();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(
        "https://api.github.com/repos/MetaCubeX/mihomo/releases/latest",
        {
          signal: ctrl.signal,
          headers: {
            "User-Agent": "ClashNode/0.1",
            Accept: "application/vnd.github+json",
          },
        },
      ).finally(() => clearTimeout(timer));
      if (!res.ok) {
        return {
          current,
          latest: null,
          htmlUrl: null,
          hasUpdate: false,
          checkedAt: new Date().toISOString(),
          error: `HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as {
        tag_name?: string;
        html_url?: string;
      };
      const latest = (data.tag_name || "").replace(/^v/, "");
      // Prefer live core version if running; otherwise read from binary (-v).
      // Never fall back to app version — that produced "current: 0.1.0" when core was stopped.
      const live = supervisor.getState().version?.replace(/^v/, "") || "";
      const fromBinary = live
        ? null
        : await getMihomoBinaryVersion();
      const curCore = (live || fromBinary || "").replace(/^v/, "");
      const hasUpdate = !!(
        latest &&
        curCore &&
        latest !== curCore
      );
      return {
        current: curCore || "unknown",
        latest: latest || null,
        htmlUrl: data.html_url || "https://github.com/MetaCubeX/mihomo/releases",
        hasUpdate,
        checkedAt: new Date().toISOString(),
        source: live ? "running" : fromBinary ? "binary" : "none",
      };
    } catch (e) {
      return {
        current,
        latest: null,
        htmlUrl: null,
        hasUpdate: false,
        checkedAt: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle("app:check-app-update", () => checkForAppUpdates());
  ipcMain.handle("app:download-update", () => downloadAppUpdate());
  ipcMain.handle("app:quit-and-install", () => {
    quitAndInstallUpdate();
    return true;
  });

  ipcMain.handle("backup:create", async () => {
    const res = await dialog.showSaveDialog({
      defaultPath: `clashnode-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (res.canceled || !res.filePath) return null;
    const home = getHomeDir();
    await zipDirectory(home, res.filePath);
    return res.filePath;
  });
  ipcMain.handle("backup:restore", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (res.canceled || !res.filePaths[0]) return false;
    await unzipToDirectory(res.filePaths[0], getHomeDir());
    if (supervisor.getState().status === "running") {
      await supervisor.restart();
    }
    mainWindow?.webContents.send("settings:changed", loadSettings());
    return true;
  });
}

async function gracefulQuit() {
  if (isQuitting) return;
  isQuitting = true;
  stopTrafficPoll();
  stopOnDemandMonitor();
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

app.whenReady().then(async () => {
  try {
    registerDefaultProtocols();
  } catch {
    /* ignore when unpackaged */
  }

  registerIpc();
  // Dock / window icons follow macOS light & dark appearance
  applyAppIconForTheme();
  nativeTheme.on("updated", () => {
    applyAppIconForTheme(nativeTheme.shouldUseDarkColors);
  });
  createWindow();
  setupTray(supervisor, () => mainWindow, () => void gracefulQuit());
  setupAutoUpdater(() => mainWindow);

  // cold-start deep link (macOS may pass via argv on some builds)
  const bootLink = process.argv.find(
    (a) => a.startsWith("clash://") || a.startsWith("clashnode://"),
  );
  if (bootLink) void handleDeepLink(bootLink);

  supervisor.on("state", () => broadcastState());
  supervisor.on("log", (line: { type?: string; payload?: string; time?: string }) => {
    const stamped = {
      type: line?.type || "info",
      payload: line?.payload ?? "",
      time: line?.time || new Date().toISOString(),
    };
    // mihomo may flush multi-line chunks
    const parts = String(stamped.payload).split(/\r?\n/).filter((s) => s.trim());
    if (parts.length <= 1) {
      mainWindow?.webContents.send("core:log", stamped);
      return;
    }
    for (const part of parts) {
      mainWindow?.webContents.send("core:log", {
        ...stamped,
        payload: part,
        time: new Date().toISOString(),
      });
    }
  });

  const settings = loadSettings();
  applyLoginItem(settings.startOnLaunch);
  applyHotkeysFromSettings(settings);
  scheduleProfileUpdates();
  startOnDemandMonitor(supervisor, (msg) => {
    mainWindow?.webContents.send("core:log", {
      type: "info",
      payload: msg,
    });
  });

  try {
    await supervisor.writeRuntimeConfig();
  } catch {
    /* ignore */
  }

  if (settings.autoStartCore && !settings.onDemand?.enabled) {
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

  if (settings.checkUpdateOnLaunch && app.isPackaged) {
    void checkForAppUpdates();
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
