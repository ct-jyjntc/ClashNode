export type ProxyMode = "rule" | "global" | "direct";
export type LogLevel = "silent" | "error" | "warning" | "info" | "debug";
export type CoreStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export type DnsEnhancedMode = "fake-ip" | "redir-host" | "normal";

export interface DnsSettings {
  enable: boolean;
  /** Always write app DNS into runtime config (override subscription DNS) */
  overrideProfile: boolean;
  enhancedMode: DnsEnhancedMode;
  fakeIpRange: string;
  defaultNameserver: string[];
  nameserver: string[];
  fallback: string[];
}

export interface HotkeySettings {
  /** Empty string = unbound */
  toggleCore: string;
  toggleSystemProxy: string;
  toggleTun: string;
  showWindow: string;
}

export interface WebDavSettings {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  path: string;
}

export type ThemeMode = "system" | "light" | "dark";

export type ThemePreset = "mono" | "ink" | "slate" | "forest" | "rose";

export interface PortSettings {
  /** classic HTTP port; 0 = disabled */
  port: number;
  /** SOCKS port; 0 = disabled */
  socksPort: number;
  redirPort: number;
  tproxyPort: number;
}

export interface OnDemandSettings {
  enabled: boolean;
  /** Only auto-start core on these SSIDs (empty = any) */
  ssids: string[];
  /** Pause proxy when offline */
  pauseWhenOffline: boolean;
}

export type DashboardWidgetId =
  | "status"
  | "upload"
  | "download"
  | "port"
  | "mode"
  | "network"
  | "traffic";

export interface DashboardLayout {
  widgets: DashboardWidgetId[];
}

export interface AppSettings {
  mixedPort: number;
  allowLan: boolean;
  mode: ProxyMode;
  logLevel: LogLevel;
  systemProxy: boolean;
  tun: boolean;
  ipv6: boolean;
  testUrl: string;
  /** 0 = disabled; otherwise refresh URL profiles every N hours */
  autoUpdateHours: number;
  externalController: string;
  /** Open ClashNode when user logs in */
  startOnLaunch: boolean;
  /** Start mihomo core when the app becomes ready */
  autoStartCore: boolean;
  minimizeToTray: boolean;
  /** Domains/IPs skipped by macOS system proxy */
  bypassDomains: string[];
  dns: DnsSettings;
  hotkeys: HotkeySettings;
  webdav: WebDavSettings;
  /** UI accent as #rrggbb; empty = monochrome default */
  accentColor: string;
  /** UI text scale 0.85–1.25 */
  textScale: number;
  checkUpdateOnLaunch: boolean;
  /** Optional classic ports alongside mixed-port */
  ports: PortSettings;
  onDemand: OnDemandSettings;
  dashboard: DashboardLayout;
  themePreset: ThemePreset;
}

export interface SubscriptionInfo {
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
}

export interface Profile {
  id: string;
  name: string;
  type: "url" | "file" | "local";
  url?: string;
  filePath?: string;
  autoUpdate: boolean;
  lastUpdated?: string;
  createdAt: string;
  subscriptionInfo?: SubscriptionInfo;
  error?: string;
  /** group name → selected proxy name */
  selectedMap?: Record<string, string>;
  /** Rules prepended before subscription rules */
  prependRules?: string[];
  /** Optional JS overwrite script id (main(config) → config) */
  scriptId?: string | null;
  /** Visual overwrite: extra proxy groups appended / merged by name */
  customProxyGroups?: CustomProxyGroup[];
  /** Visual overwrite: rules replacing prependRules if set (same semantics) */
  customRules?: string[];
}

export interface CustomProxyGroup {
  name: string;
  type: "select" | "url-test" | "fallback" | "load-balance";
  proxies: string[];
  url?: string;
  interval?: number;
}

export interface ProfilesState {
  currentId: string | null;
  items: Profile[];
}

export interface CoreState {
  status: CoreStatus;
  version?: string;
  pid?: number;
  error?: string;
  secret: string;
  controller: string;
  mixedPort: number;
  systemProxy: boolean;
  tun: boolean;
  mode: ProxyMode;
}

export interface TrafficSnapshot {
  up: number;
  down: number;
  upTotal?: number;
  downTotal?: number;
}

export interface ProxyNode {
  name: string;
  type: string;
  udp?: boolean;
  alive?: boolean;
  now?: string;
  all?: string[];
  history?: { time: string; delay: number }[];
  provider?: string;
  hidden?: boolean;
}

export interface ProxiesResponse {
  proxies: Record<string, ProxyNode>;
}

export interface ConnectionItem {
  id: string;
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
  rulePayload: string;
  metadata: {
    network?: string;
    type?: string;
    sourceIP?: string;
    sourcePort?: string;
    destinationIP?: string;
    destinationPort?: string;
    host?: string;
    process?: string;
    processPath?: string;
    dnsMode?: string;
  };
}

export interface ConnectionsSnapshot {
  downloadTotal: number;
  uploadTotal: number;
  connections: ConnectionItem[];
  memory?: number;
}

export interface RuleItem {
  type: string;
  payload: string;
  proxy: string;
  size: number;
}

export interface LogLine {
  type: string;
  payload: string;
  time?: string;
}

export interface ProviderInfo {
  name: string;
  type: string;
  vehicleType: string;
  updatedAt?: string;
  subscriptionInfo?: SubscriptionInfo;
  proxies?: ProxyNode[];
  provider?: string;
}

export interface ProvidersResponse {
  providers: Record<string, ProviderInfo>;
}

export interface RequestItem {
  id: string;
  time: string;
  host: string;
  process?: string;
  rule: string;
  rulePayload?: string;
  chains: string[];
  network?: string;
  type?: string;
  upload: number;
  download: number;
}

export interface GeoResourceFile {
  name: string;
  path: string;
  exists: boolean;
  size: number;
  mtime?: string;
}

export const DEFAULT_WEBDAV: WebDavSettings = {
  enabled: false,
  url: "",
  username: "",
  password: "",
  path: "/ClashNode",
};

export const DEFAULT_BYPASS = [
  "127.0.0.1",
  "192.168.0.0/16",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "localhost",
  "*.local",
  "timestamp.apple.com",
  "sequoia.apple.com",
  "seed-sequoia.siri.apple.com",
];

export const DEFAULT_DNS: DnsSettings = {
  enable: true,
  overrideProfile: false,
  enhancedMode: "fake-ip",
  fakeIpRange: "198.18.0.1/16",
  defaultNameserver: ["223.5.5.5", "8.8.8.8"],
  nameserver: [
    "https://doh.pub/dns-query",
    "https://dns.alidns.com/dns-query",
  ],
  fallback: [
    "https://dns.google/dns-query",
    "https://cloudflare-dns.com/dns-query",
  ],
};

export const DEFAULT_HOTKEYS: HotkeySettings = {
  toggleCore: "CommandOrControl+Shift+C",
  toggleSystemProxy: "CommandOrControl+Shift+P",
  toggleTun: "",
  showWindow: "CommandOrControl+Shift+V",
};

export const DEFAULT_PORTS: PortSettings = {
  port: 0,
  socksPort: 0,
  redirPort: 0,
  tproxyPort: 0,
};

export const DEFAULT_ON_DEMAND: OnDemandSettings = {
  enabled: false,
  ssids: [],
  pauseWhenOffline: true,
};

export const DEFAULT_DASHBOARD: DashboardLayout = {
  widgets: [
    "status",
    "upload",
    "download",
    "port",
    "mode",
    "network",
    "traffic",
  ],
};

export const DEFAULT_SETTINGS: AppSettings = {
  mixedPort: 7890,
  allowLan: false,
  mode: "rule",
  logLevel: "info",
  systemProxy: true,
  tun: false,
  ipv6: false,
  testUrl: "https://www.gstatic.com/generate_204",
  autoUpdateHours: 24,
  externalController: "127.0.0.1:9090",
  startOnLaunch: false,
  autoStartCore: false,
  minimizeToTray: true,
  bypassDomains: [...DEFAULT_BYPASS],
  dns: {
    ...DEFAULT_DNS,
    defaultNameserver: [...DEFAULT_DNS.defaultNameserver],
    nameserver: [...DEFAULT_DNS.nameserver],
    fallback: [...DEFAULT_DNS.fallback],
  },
  hotkeys: { ...DEFAULT_HOTKEYS },
  webdav: { ...DEFAULT_WEBDAV },
  accentColor: "",
  textScale: 1,
  checkUpdateOnLaunch: true,
  ports: { ...DEFAULT_PORTS },
  onDemand: { ...DEFAULT_ON_DEMAND, ssids: [] },
  dashboard: { widgets: [...DEFAULT_DASHBOARD.widgets] },
  themePreset: "mono",
};

export const THEME_PRESETS: Record<
  ThemePreset,
  { label: string; accent: string }
> = {
  mono: { label: "Mono", accent: "" },
  ink: { label: "Ink", accent: "#111827" },
  slate: { label: "Slate", accent: "#334155" },
  forest: { label: "Forest", accent: "#14532d" },
  rose: { label: "Rose", accent: "#9f1239" },
};

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  htmlUrl: string | null;
  hasUpdate: boolean;
  checkedAt: string;
  error?: string;
}

export const GEO_FILES = [
  "geoip.metadb",
  "GeoIP.dat",
  "GeoSite.dat",
  "ASN.mmdb",
  "country.mmdb",
] as const;

export const GEO_DOWNLOADS: Record<string, string> = {
  "geoip.metadb":
    "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb",
  "GeoIP.dat":
    "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat",
  "GeoSite.dat":
    "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
  "ASN.mmdb":
    "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",
  "country.mmdb":
    "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb",
};
