import {
  DEFAULT_DASHBOARD,
  DEFAULT_DNS,
  DEFAULT_HOTKEYS,
  DEFAULT_ON_DEMAND,
  DEFAULT_PORTS,
  DEFAULT_SETTINGS,
  DEFAULT_WEBDAV,
  type AppSettings,
  type DashboardLayout,
  type DnsSettings,
  type HotkeySettings,
  type OnDemandSettings,
  type PortSettings,
  type ThemePreset,
  type WebDavSettings,
} from "../shared/types";
import { getSettingsPath, readJsonFile, writeJsonFile } from "./paths";

function normalizeDns(raw: Partial<DnsSettings> | undefined): DnsSettings {
  const d = { ...DEFAULT_DNS, ...(raw ?? {}) };
  return {
    enable: !!d.enable,
    overrideProfile: !!d.overrideProfile,
    enhancedMode: d.enhancedMode ?? "fake-ip",
    fakeIpRange: d.fakeIpRange || DEFAULT_DNS.fakeIpRange,
    defaultNameserver: Array.isArray(d.defaultNameserver)
      ? d.defaultNameserver.filter(Boolean)
      : [...DEFAULT_DNS.defaultNameserver],
    nameserver: Array.isArray(d.nameserver)
      ? d.nameserver.filter(Boolean)
      : [...DEFAULT_DNS.nameserver],
    fallback: Array.isArray(d.fallback)
      ? d.fallback.filter(Boolean)
      : [...DEFAULT_DNS.fallback],
  };
}

function normalizeHotkeys(
  raw: Partial<HotkeySettings> | undefined,
): HotkeySettings {
  const h = { ...DEFAULT_HOTKEYS, ...(raw ?? {}) };
  return {
    toggleCore: h.toggleCore ?? "",
    toggleSystemProxy: h.toggleSystemProxy ?? "",
    toggleTun: h.toggleTun ?? "",
    showWindow: h.showWindow ?? "",
  };
}

function normalizeWebDav(
  raw: Partial<WebDavSettings> | undefined,
): WebDavSettings {
  return {
    ...DEFAULT_WEBDAV,
    ...(raw ?? {}),
    enabled: !!(raw?.enabled ?? DEFAULT_WEBDAV.enabled),
    url: raw?.url ?? "",
    username: raw?.username ?? "",
    password: raw?.password ?? "",
    path: raw?.path || DEFAULT_WEBDAV.path,
  };
}

function normalizePorts(raw: Partial<PortSettings> | undefined): PortSettings {
  return {
    port: Number(raw?.port) || 0,
    socksPort: Number(raw?.socksPort) || 0,
    redirPort: Number(raw?.redirPort) || 0,
    tproxyPort: Number(raw?.tproxyPort) || 0,
  };
}

function normalizeOnDemand(
  raw: Partial<OnDemandSettings> | undefined,
): OnDemandSettings {
  return {
    enabled: !!raw?.enabled,
    ssids: Array.isArray(raw?.ssids) ? raw!.ssids.filter(Boolean) : [],
    pauseWhenOffline: raw?.pauseWhenOffline !== false,
  };
}

function normalizeDashboard(
  raw: Partial<DashboardLayout> | undefined,
): DashboardLayout {
  const widgets = Array.isArray(raw?.widgets)
    ? raw!.widgets
    : [...DEFAULT_DASHBOARD.widgets];
  return { widgets: widgets.length ? widgets : [...DEFAULT_DASHBOARD.widgets] };
}

export function loadSettings(): AppSettings {
  const raw = readJsonFile<Partial<AppSettings>>(getSettingsPath(), {});
  const presets: ThemePreset[] = ["mono", "ink", "slate", "forest", "rose"];
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    bypassDomains: Array.isArray(raw.bypassDomains)
      ? raw.bypassDomains.filter(Boolean)
      : [...DEFAULT_SETTINGS.bypassDomains],
    dns: normalizeDns(raw.dns),
    hotkeys: normalizeHotkeys(raw.hotkeys),
    webdav: normalizeWebDav(raw.webdav),
    accentColor:
      typeof raw.accentColor === "string" ? raw.accentColor : "",
    textScale:
      typeof raw.textScale === "number" && raw.textScale >= 0.85 && raw.textScale <= 1.25
        ? raw.textScale
        : 1,
    checkUpdateOnLaunch: raw.checkUpdateOnLaunch !== false,
    ports: normalizePorts(raw.ports ?? DEFAULT_PORTS),
    onDemand: normalizeOnDemand(raw.onDemand ?? DEFAULT_ON_DEMAND),
    dashboard: normalizeDashboard(raw.dashboard ?? DEFAULT_DASHBOARD),
    themePreset: presets.includes(raw.themePreset as ThemePreset)
      ? (raw.themePreset as ThemePreset)
      : "mono",
  };
  return merged;
}

export function saveSettings(settings: AppSettings) {
  writeJsonFile(getSettingsPath(), settings);
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const prev = loadSettings();
  const next: AppSettings = {
    ...prev,
    ...patch,
    bypassDomains:
      patch.bypassDomains != null
        ? patch.bypassDomains.filter(Boolean)
        : prev.bypassDomains,
    dns: patch.dns
      ? normalizeDns({ ...prev.dns, ...patch.dns })
      : prev.dns,
    hotkeys: patch.hotkeys
      ? normalizeHotkeys({ ...prev.hotkeys, ...patch.hotkeys })
      : prev.hotkeys,
    webdav: patch.webdav
      ? normalizeWebDav({ ...prev.webdav, ...patch.webdav })
      : prev.webdav,
    ports: patch.ports
      ? normalizePorts({ ...prev.ports, ...patch.ports })
      : prev.ports,
    onDemand: patch.onDemand
      ? normalizeOnDemand({ ...prev.onDemand, ...patch.onDemand })
      : prev.onDemand,
    dashboard: patch.dashboard
      ? normalizeDashboard({ ...prev.dashboard, ...patch.dashboard })
      : prev.dashboard,
    themePreset: patch.themePreset ?? prev.themePreset,
  };
  saveSettings(next);
  return next;
}

/** Parse textarea (newline / comma) into clean list. */
export function parseLineList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatLineList(list: string[]): string {
  return list.join("\n");
}
