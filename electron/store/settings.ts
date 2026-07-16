import {
  DEFAULT_DASHBOARD,
  DEFAULT_DNS,
  DEFAULT_GEOX_URL,
  DEFAULT_GLOBAL_UA,
  DEFAULT_HOTKEYS,
  DEFAULT_ON_DEMAND,
  DEFAULT_PORTS,
  DEFAULT_PROXIES_UI,
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_DNS,
  DEFAULT_WEBDAV,
  SETTINGS_VERSION,
  type AppSettings,
  type DashboardLayout,
  type DashboardWidgetId,
  type DnsSettings,
  type FindProcessMode,
  type GeodataLoader,
  type GeoxUrlSettings,
  type HotkeySettings,
  type OnDemandSettings,
  type PortSettings,
  type ProxiesUiSettings,
  type SystemDnsSettings,
  type ThemePreset,
  type WebDavSettings,
} from "../shared/types";
import { settingsFileSchema } from "../shared/schemas";
import { getSettingsPath, readJsonFileSafe, writeJsonFile } from "./paths";

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

const ALL_WIDGETS: DashboardWidgetId[] = [
  "status",
  "upload",
  "download",
  "port",
  "mode",
  "network",
  "traffic",
  "memory",
  "publicIp",
  "networkCheck",
];

function normalizeDashboard(
  raw: Partial<DashboardLayout> | undefined,
): DashboardLayout {
  const widgets = Array.isArray(raw?.widgets)
    ? (raw!.widgets as DashboardWidgetId[]).filter((w) =>
        ALL_WIDGETS.includes(w),
      )
    : [...DEFAULT_DASHBOARD.widgets];
  return { widgets: widgets.length ? widgets : [...DEFAULT_DASHBOARD.widgets] };
}

function normalizeGeoxUrl(
  raw: Partial<GeoxUrlSettings> | undefined,
): GeoxUrlSettings {
  return {
    geoip: raw?.geoip || DEFAULT_GEOX_URL.geoip,
    geosite: raw?.geosite || DEFAULT_GEOX_URL.geosite,
    mmdb: raw?.mmdb || DEFAULT_GEOX_URL.mmdb,
    asn: raw?.asn || DEFAULT_GEOX_URL.asn,
  };
}

function normalizeHosts(
  raw: Record<string, string> | undefined,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === "string" && typeof v === "string" && k.trim()) {
      out[k.trim()] = v.trim();
    }
  }
  return out;
}

function normalizeProxiesUi(
  raw: Partial<ProxiesUiSettings> | undefined,
): ProxiesUiSettings {
  const sort = raw?.sort;
  const validSort =
    sort === "default" || sort === "name" || sort === "delay" || sort === "type"
      ? sort
      : DEFAULT_PROXIES_UI.sort;
  return {
    sort: validSort,
    sortAsc: raw?.sortAsc !== false,
    density: raw?.density === "compact" ? "compact" : "comfortable",
  };
}

function normalizeSystemDns(
  raw: Partial<SystemDnsSettings> | undefined,
): SystemDnsSettings {
  return {
    enabled: !!raw?.enabled,
    servers: Array.isArray(raw?.servers)
      ? raw!.servers.filter(Boolean)
      : [...DEFAULT_SYSTEM_DNS.servers],
  };
}

function normalizeFindProcessMode(raw: unknown): FindProcessMode {
  if (raw === "off" || raw === "always" || raw === "strict") return raw;
  return "strict";
}

function normalizeGeodataLoader(raw: unknown): GeodataLoader {
  if (raw === "standard" || raw === "memconservative") return raw;
  return "memconservative";
}

/** Migrate raw settings blob across versions. */
export function migrateSettingsRaw(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const version =
    typeof raw.settingsVersion === "number" ? raw.settingsVersion : 0;
  let data = { ...raw };
  // v0 → v1: introduce settingsVersion and advanced defaults (filled by normalize)
  if (version < 1) {
    data = { ...data, settingsVersion: SETTINGS_VERSION };
  }
  if ((data.settingsVersion as number) < SETTINGS_VERSION) {
    data.settingsVersion = SETTINGS_VERSION;
  }
  return data;
}

export function loadSettings(): AppSettings {
  const rawUnchecked = readJsonFileSafe<Record<string, unknown>>(
    getSettingsPath(),
    {},
    (data) => settingsFileSchema.safeParse(data).success,
  );
  const raw = migrateSettingsRaw(rawUnchecked) as Partial<AppSettings> &
    Record<string, unknown>;
  const presets: ThemePreset[] = ["mono", "ink", "slate", "forest", "rose"];
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    settingsVersion: SETTINGS_VERSION,
    bypassDomains: Array.isArray(raw.bypassDomains)
      ? raw.bypassDomains.filter(Boolean)
      : [...DEFAULT_SETTINGS.bypassDomains],
    dns: normalizeDns(raw.dns as Partial<DnsSettings> | undefined),
    hotkeys: normalizeHotkeys(raw.hotkeys as Partial<HotkeySettings> | undefined),
    webdav: normalizeWebDav(raw.webdav as Partial<WebDavSettings> | undefined),
    accentColor:
      typeof raw.accentColor === "string" ? raw.accentColor : "",
    textScale:
      typeof raw.textScale === "number" &&
      raw.textScale >= 0.85 &&
      raw.textScale <= 1.25
        ? raw.textScale
        : 1,
    checkUpdateOnLaunch: raw.checkUpdateOnLaunch !== false,
    showTrayTitle: raw.showTrayTitle !== false,
    ports: normalizePorts(
      (raw.ports as Partial<PortSettings> | undefined) ?? DEFAULT_PORTS,
    ),
    onDemand: normalizeOnDemand(
      (raw.onDemand as Partial<OnDemandSettings> | undefined) ??
        DEFAULT_ON_DEMAND,
    ),
    dashboard: normalizeDashboard(
      (raw.dashboard as Partial<DashboardLayout> | undefined) ??
        DEFAULT_DASHBOARD,
    ),
    themePreset: presets.includes(raw.themePreset as ThemePreset)
      ? (raw.themePreset as ThemePreset)
      : "mono",
    hosts: normalizeHosts(raw.hosts as Record<string, string> | undefined),
    geoxUrl: normalizeGeoxUrl(
      raw.geoxUrl as Partial<GeoxUrlSettings> | undefined,
    ),
    keepAliveInterval:
      typeof raw.keepAliveInterval === "number" && raw.keepAliveInterval > 0
        ? raw.keepAliveInterval
        : DEFAULT_SETTINGS.keepAliveInterval,
    geodataLoader: normalizeGeodataLoader(raw.geodataLoader),
    globalUa:
      typeof raw.globalUa === "string" && raw.globalUa.trim()
        ? raw.globalUa
        : DEFAULT_GLOBAL_UA,
    unifiedDelay: raw.unifiedDelay !== false,
    tcpConcurrent: raw.tcpConcurrent !== false,
    findProcessMode: normalizeFindProcessMode(raw.findProcessMode),
    globalPrependRules: Array.isArray(raw.globalPrependRules)
      ? raw.globalPrependRules.filter(Boolean)
      : [],
    proxiesUi: normalizeProxiesUi(
      raw.proxiesUi as Partial<ProxiesUiSettings> | undefined,
    ),
    systemDns: normalizeSystemDns(
      raw.systemDns as Partial<SystemDnsSettings> | undefined,
    ),
    developerMode: !!raw.developerMode,
  };
  return merged;
}

export function saveSettings(settings: AppSettings) {
  writeJsonFile(getSettingsPath(), {
    ...settings,
    settingsVersion: SETTINGS_VERSION,
  });
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const prev = loadSettings();
  const next: AppSettings = {
    ...prev,
    ...patch,
    settingsVersion: SETTINGS_VERSION,
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
    hosts:
      patch.hosts != null ? normalizeHosts(patch.hosts) : prev.hosts,
    geoxUrl: patch.geoxUrl
      ? normalizeGeoxUrl({ ...prev.geoxUrl, ...patch.geoxUrl })
      : prev.geoxUrl,
    keepAliveInterval:
      patch.keepAliveInterval != null
        ? Number(patch.keepAliveInterval) || prev.keepAliveInterval
        : prev.keepAliveInterval,
    geodataLoader:
      patch.geodataLoader != null
        ? normalizeGeodataLoader(patch.geodataLoader)
        : prev.geodataLoader,
    globalUa:
      patch.globalUa != null
        ? patch.globalUa.trim() || DEFAULT_GLOBAL_UA
        : prev.globalUa,
    unifiedDelay:
      patch.unifiedDelay != null ? !!patch.unifiedDelay : prev.unifiedDelay,
    tcpConcurrent:
      patch.tcpConcurrent != null ? !!patch.tcpConcurrent : prev.tcpConcurrent,
    findProcessMode:
      patch.findProcessMode != null
        ? normalizeFindProcessMode(patch.findProcessMode)
        : prev.findProcessMode,
    globalPrependRules:
      patch.globalPrependRules != null
        ? patch.globalPrependRules.filter(Boolean)
        : prev.globalPrependRules,
    proxiesUi: patch.proxiesUi
      ? normalizeProxiesUi({ ...prev.proxiesUi, ...patch.proxiesUi })
      : prev.proxiesUi,
    systemDns: patch.systemDns
      ? normalizeSystemDns({ ...prev.systemDns, ...patch.systemDns })
      : prev.systemDns,
    developerMode:
      patch.developerMode != null ? !!patch.developerMode : prev.developerMode,
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
