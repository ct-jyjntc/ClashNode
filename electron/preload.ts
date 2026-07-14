import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  ConnectionsSnapshot,
  CoreState,
  CustomProxyGroup,
  GeoResourceFile,
  LogLine,
  Profile,
  ProfilesState,
  ProvidersResponse,
  ProxiesResponse,
  ProxyMode,
  RequestItem,
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
  setPrependRules: (id: string, rules: string[]): Promise<Profile> =>
    ipcRenderer.invoke("profiles:set-prepend-rules", { id, rules }),
  setProfileScript: (
    id: string,
    scriptId: string | null,
  ): Promise<Profile> =>
    ipcRenderer.invoke("profiles:set-script", { id, scriptId }),
  setCustomProxyGroups: (
    id: string,
    groups: CustomProxyGroup[],
  ): Promise<Profile> =>
    ipcRenderer.invoke("profiles:set-custom-groups", { id, groups }),
  setCustomRules: (id: string, rules: string[]): Promise<Profile> =>
    ipcRenderer.invoke("profiles:set-custom-rules", { id, rules }),
  reorderProfiles: (ids: string[]): Promise<ProfilesState> =>
    ipcRenderer.invoke("profiles:reorder", ids),
  getMergedPreview: (id?: string): Promise<string> =>
    ipcRenderer.invoke("profiles:merged-preview", id),
  importClipboard: (): Promise<{
    type: "url" | "file";
    profile: Profile;
  }> => ipcRenderer.invoke("profiles:import-clipboard"),
  listScripts: (): Promise<
    Array<{ id: string; name: string; createdAt: string; updatedAt: string }>
  > => ipcRenderer.invoke("scripts:list"),
  createScript: (
    name?: string,
  ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> =>
    ipcRenderer.invoke("scripts:create", name),
  renameScript: (
    id: string,
    name: string,
  ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> =>
    ipcRenderer.invoke("scripts:rename", { id, name }),
  getScriptContent: (id: string): Promise<string> =>
    ipcRenderer.invoke("scripts:content", id),
  saveScriptContent: (
    id: string,
    content: string,
  ): Promise<{ id: string; name: string; createdAt: string; updatedAt: string }> =>
    ipcRenderer.invoke("scripts:save", { id, content }),
  deleteScript: (
    id: string,
  ): Promise<{ items: Array<{ id: string; name: string }> }> =>
    ipcRenderer.invoke("scripts:delete", id),
  getDefaultScript: (): Promise<string> => ipcRenderer.invoke("scripts:default"),
  checkUpdate: (): Promise<{
    current: string;
    latest: string | null;
    htmlUrl: string | null;
    hasUpdate: boolean;
    checkedAt: string;
    error?: string;
  }> => ipcRenderer.invoke("app:check-update"),
  checkAppUpdate: (): Promise<{
    ok: boolean;
    version?: string | null;
    error?: string;
  }> => ipcRenderer.invoke("app:check-app-update"),
  downloadAppUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("app:download-update"),
  quitAndInstall: (): Promise<boolean> =>
    ipcRenderer.invoke("app:quit-and-install"),
  onUpdaterAvailable: (
    cb: (info: { version: string; releaseNotes: unknown }) => void,
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      info: { version: string; releaseNotes: unknown },
    ) => cb(info);
    ipcRenderer.on("updater:available", listener);
    return () => ipcRenderer.removeListener("updater:available", listener);
  },
  onUpdaterProgress: (
    cb: (p: { percent: number; transferred: number; total: number }) => void,
  ) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      p: { percent: number; transferred: number; total: number },
    ) => cb(p);
    ipcRenderer.on("updater:progress", listener);
    return () => ipcRenderer.removeListener("updater:progress", listener);
  },
  onUpdaterDownloaded: (cb: (info: { version: string }) => void) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      info: { version: string },
    ) => cb(info);
    ipcRenderer.on("updater:downloaded", listener);
    return () => ipcRenderer.removeListener("updater:downloaded", listener);
  },

  getRuntimeConfig: (): Promise<string> =>
    ipcRenderer.invoke("config:runtime"),
  saveRuntimeConfig: (content: string): Promise<void> =>
    ipcRenderer.invoke("config:save-runtime", content),

  getProxies: (): Promise<ProxiesResponse> => ipcRenderer.invoke("api:proxies"),
  selectProxy: (group: string, name: string): Promise<void> =>
    ipcRenderer.invoke("api:select-proxy", { group, name }),
  testDelay: (name: string): Promise<{ delay: number }> =>
    ipcRenderer.invoke("api:delay", name),
  getConnections: (): Promise<ConnectionsSnapshot> =>
    ipcRenderer.invoke("api:connections"),
  closeConnection: (id: string): Promise<void> =>
    ipcRenderer.invoke("api:close-connection", id),
  closeAllConnections: (): Promise<void> =>
    ipcRenderer.invoke("api:close-all-connections"),
  getRules: (): Promise<{ rules: RuleItem[] }> => ipcRenderer.invoke("api:rules"),
  getProviders: (): Promise<ProvidersResponse> =>
    ipcRenderer.invoke("api:providers"),
  updateProvider: (name: string): Promise<void> =>
    ipcRenderer.invoke("api:update-provider", name),
  healthcheckProvider: (name: string): Promise<void> =>
    ipcRenderer.invoke("api:healthcheck-provider", name),
  flushFakeIp: (): Promise<void> => ipcRenderer.invoke("api:flush-fakeip"),
  flushDns: (): Promise<void> => ipcRenderer.invoke("api:flush-dns"),
  upgradeGeo: (): Promise<void> => ipcRenderer.invoke("api:upgrade-geo"),
  setMode: (mode: ProxyMode): Promise<void> =>
    ipcRenderer.invoke("api:set-mode", mode),
  patchConfigs: (body: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke("api:patch-configs", body),

  getRequests: (): Promise<RequestItem[]> => ipcRenderer.invoke("requests:list"),
  clearRequests: (): Promise<boolean> => ipcRenderer.invoke("requests:clear"),

  listGeo: (): Promise<GeoResourceFile[]> => ipcRenderer.invoke("geo:list"),
  downloadGeo: (name: string): Promise<GeoResourceFile> =>
    ipcRenderer.invoke("geo:download", name),
  downloadAllGeo: (): Promise<GeoResourceFile[]> =>
    ipcRenderer.invoke("geo:download-all"),

  webdavTest: (): Promise<{ ok: boolean; httpStatus: string }> =>
    ipcRenderer.invoke("webdav:test"),
  webdavUpload: (): Promise<string> => ipcRenderer.invoke("webdav:upload"),
  webdavDownload: (): Promise<boolean> => ipcRenderer.invoke("webdav:download"),

  setSystemProxy: (enabled: boolean): Promise<AppSettings> =>
    ipcRenderer.invoke("system:proxy", enabled),
  authorizeTun: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke("system:authorize-tun"),
  copyProxyEnv: (): Promise<string> =>
    ipcRenderer.invoke("system:copy-proxy-env"),

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
  onRequestItem: (cb: (item: RequestItem) => void) => {
    const listener = (_: Electron.IpcRendererEvent, item: RequestItem) => cb(item);
    ipcRenderer.on("requests:item", listener);
    return () => ipcRenderer.removeListener("requests:item", listener);
  },
};

contextBridge.exposeInMainWorld("clashnode", api);

export type ClashNodeAPI = typeof api;
