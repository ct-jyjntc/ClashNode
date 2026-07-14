import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  ConnectionsSnapshot,
  CoreState,
  LogLine,
  Profile,
  ProfilesState,
  ProxiesResponse,
  ProxyMode,
  RuleItem,
  TrafficSnapshot,
} from "./shared/types";

const api = {
  getCoreState: (): Promise<CoreState> => ipcRenderer.invoke("core:state"),
  startCore: (): Promise<CoreState> => ipcRenderer.invoke("core:start"),
  stopCore: (): Promise<CoreState> => ipcRenderer.invoke("core:stop"),
  restartCore: (): Promise<CoreState> => ipcRenderer.invoke("core:restart"),
  reloadConfig: (): Promise<CoreState> => ipcRenderer.invoke("core:reload"),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", patch),

  getProfiles: (): Promise<ProfilesState> => ipcRenderer.invoke("profiles:list"),
  addProfileUrl: (url: string, name?: string): Promise<Profile> =>
    ipcRenderer.invoke("profiles:add-url", { url, name }),
  addProfileFile: (): Promise<Profile | null> =>
    ipcRenderer.invoke("profiles:add-file"),
  updateProfile: (id: string): Promise<Profile> =>
    ipcRenderer.invoke("profiles:update", id),
  deleteProfile: (id: string): Promise<ProfilesState> =>
    ipcRenderer.invoke("profiles:delete", id),
  setCurrentProfile: (id: string | null): Promise<ProfilesState> =>
    ipcRenderer.invoke("profiles:set-current", id),
  renameProfile: (id: string, name: string): Promise<Profile> =>
    ipcRenderer.invoke("profiles:rename", { id, name }),
  editProfile: (
    id: string,
    patch: { name?: string; url?: string; autoUpdate?: boolean },
  ): Promise<Profile> => ipcRenderer.invoke("profiles:edit", { id, patch }),
  getProfileContent: (id: string): Promise<string | null> =>
    ipcRenderer.invoke("profiles:content", id),
  saveProfileContent: (id: string, content: string): Promise<Profile> =>
    ipcRenderer.invoke("profiles:save-content", { id, content }),
  getRuntimeConfig: (): Promise<string> =>
    ipcRenderer.invoke("config:runtime"),
  saveRuntimeConfig: (content: string): Promise<void> =>
    ipcRenderer.invoke("config:save-runtime", content),

  getProxies: (): Promise<ProxiesResponse> => ipcRenderer.invoke("api:proxies"),
  selectProxy: (group: string, name: string): Promise<void> =>
    ipcRenderer.invoke("api:select-proxy", { group, name }),
  testDelay: (
    name: string,
  ): Promise<{ delay: number }> => ipcRenderer.invoke("api:delay", name),
  getConnections: (): Promise<ConnectionsSnapshot> =>
    ipcRenderer.invoke("api:connections"),
  closeConnection: (id: string): Promise<void> =>
    ipcRenderer.invoke("api:close-connection", id),
  closeAllConnections: (): Promise<void> =>
    ipcRenderer.invoke("api:close-all-connections"),
  getRules: (): Promise<{ rules: RuleItem[] }> => ipcRenderer.invoke("api:rules"),
  getProviders: (): Promise<{ providers: Record<string, unknown> }> =>
    ipcRenderer.invoke("api:providers"),
  updateProvider: (name: string): Promise<void> =>
    ipcRenderer.invoke("api:update-provider", name),
  setMode: (mode: ProxyMode): Promise<void> =>
    ipcRenderer.invoke("api:set-mode", mode),
  patchConfigs: (body: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke("api:patch-configs", body),

  setSystemProxy: (enabled: boolean): Promise<AppSettings> =>
    ipcRenderer.invoke("system:proxy", enabled),
  authorizeTun: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke("system:authorize-tun"),

  createBackup: (): Promise<string | null> =>
    ipcRenderer.invoke("backup:create"),
  restoreBackup: (): Promise<boolean> => ipcRenderer.invoke("backup:restore"),

  getApiCredentials: (): Promise<{ controller: string; secret: string }> =>
    ipcRenderer.invoke("api:credentials"),

  getAppPaths: (): Promise<{
    home: string;
    config: string;
    profiles: string;
    settings: string;
    mihomo: string;
  }> => ipcRenderer.invoke("app:paths"),
  openPath: (which: string): Promise<boolean> =>
    ipcRenderer.invoke("app:open-path", which),
  showItemInFolder: (which: string): Promise<boolean> =>
    ipcRenderer.invoke("app:show-item", which),
  copyText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke("app:copy-text", text),
  getAppVersion: (): Promise<{
    app: string;
    electron: string;
    node: string;
    chrome: string;
    platform: string;
    arch: string;
  }> => ipcRenderer.invoke("app:get-version"),

  onCoreState: (cb: (state: CoreState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: CoreState) => cb(state);
    ipcRenderer.on("core:state", listener);
    return () => ipcRenderer.removeListener("core:state", listener);
  },
  onSettingsChanged: (cb: (settings: AppSettings) => void) => {
    const listener = (_: Electron.IpcRendererEvent, s: AppSettings) => cb(s);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },
  onCoreLog: (cb: (line: LogLine) => void) => {
    const listener = (_: Electron.IpcRendererEvent, line: LogLine) => cb(line);
    ipcRenderer.on("core:log", listener);
    return () => ipcRenderer.removeListener("core:log", listener);
  },
  onTraffic: (cb: (t: TrafficSnapshot) => void) => {
    const listener = (_: Electron.IpcRendererEvent, t: TrafficSnapshot) => cb(t);
    ipcRenderer.on("traffic:update", listener);
    return () => ipcRenderer.removeListener("traffic:update", listener);
  },
};

contextBridge.exposeInMainWorld("clashnode", api);

export type ClashNodeAPI = typeof api;
