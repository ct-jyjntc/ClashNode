import yaml from "js-yaml";
import type {
  AppSettings,
  CustomProxyGroup,
  DnsSettings,
  MergeConfigOptions,
} from "../shared/types";
import { runConfigScript } from "./script-runner";
import { readScriptContent } from "../store/scripts";

const BUILTIN = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"]);

const MINIMAL_BASE = {
  proxies: [] as unknown[],
  "proxy-groups": [] as unknown[],
  rules: ["MATCH,DIRECT"],
};

type Group = {
  name?: string;
  type?: string;
  proxies?: string[];
  use?: string[];
  icon?: string;
  url?: string;
  interval?: number;
  [key: string]: unknown;
};

/**
 * Fix incomplete subscription YAML that references missing group/proxy names
 * (common when a provider returns only rules + a selector shell).
 */
export function sanitizeProxyGraph(base: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const proxies = Array.isArray(base.proxies) ? (base.proxies as Group[]) : [];
  let groups = Array.isArray(base["proxy-groups"])
    ? ([...(base["proxy-groups"] as Group[])] as Group[])
    : [];
  const providers =
    base["proxy-providers"] && typeof base["proxy-providers"] === "object"
      ? (base["proxy-providers"] as Record<string, unknown>)
      : {};

  const known = new Set<string>(BUILTIN);
  for (const p of proxies) {
    if (p && typeof p.name === "string") known.add(p.name);
  }
  for (const g of groups) {
    if (g && typeof g.name === "string") known.add(g.name);
  }
  for (const name of Object.keys(providers)) known.add(name);

  const missing = new Set<string>();
  for (const g of groups) {
    for (const ref of g.proxies ?? []) {
      if (typeof ref === "string" && !known.has(ref)) missing.add(ref);
    }
  }

  if (missing.size > 0) {
    for (const name of missing) {
      groups.push({
        name,
        type: "select",
        proxies: ["DIRECT", "REJECT"],
      });
      known.add(name);
      warnings.push(`Missing proxy/group "${name}" — added DIRECT/REJECT stub`);
    }
    base["proxy-groups"] = groups;
  }

  groups = Array.isArray(base["proxy-groups"])
    ? (base["proxy-groups"] as Group[])
    : groups;

  for (const g of groups) {
    if (!g || typeof g !== "object") continue;
    const use = Array.isArray(g.use) ? g.use : [];
    const list = Array.isArray(g.proxies) ? g.proxies : [];
    const filtered = list.filter((n) => typeof n === "string" && known.has(n));
    if (filtered.length === 0 && use.length === 0) {
      g.proxies = ["DIRECT"];
      warnings.push(
        `Group "${g.name ?? "?"}" had no valid members — fallback to DIRECT`,
      );
    } else if (filtered.length !== list.length) {
      g.proxies = filtered;
    }
  }

  base["proxy-groups"] = groups;

  if (proxies.length === 0 && groups.length === 0) {
    base["proxy-groups"] = [
      { name: "PROXY", type: "select", proxies: ["DIRECT", "REJECT"] },
    ];
    warnings.push("No proxies in profile — created empty PROXY group");
  }

  if (
    proxies.length === 0 &&
    Object.keys(providers).length === 0 &&
    groups.length > 0
  ) {
    warnings.push(
      "Profile has no proxy nodes (proxies: []). Subscription may be incomplete or require a different URL.",
    );
  }

  return warnings;
}

function buildDnsBlock(dns: DnsSettings): Record<string, unknown> {
  return {
    enable: dns.enable,
    ipv6: false,
    "enhanced-mode": dns.enhancedMode,
    "fake-ip-range": dns.fakeIpRange,
    "default-nameserver":
      dns.defaultNameserver.length > 0
        ? dns.defaultNameserver
        : ["223.5.5.5", "8.8.8.8"],
    nameserver:
      dns.nameserver.length > 0
        ? dns.nameserver
        : ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
    fallback: dns.fallback.length > 0 ? dns.fallback : undefined,
    "fallback-filter":
      dns.fallback.length > 0
        ? { geoip: true, ipcidr: ["240.0.0.0/4", "0.0.0.0/32"] }
        : undefined,
  };
}

function mergeCustomProxies(
  base: Record<string, unknown>,
  custom: Array<Record<string, unknown>>,
) {
  if (!custom.length) return;
  const proxies = Array.isArray(base.proxies)
    ? ([...(base.proxies as Record<string, unknown>[])] as Record<
        string,
        unknown
      >[])
    : [];
  for (const node of custom) {
    if (!node || typeof node !== "object") continue;
    const name = typeof node.name === "string" ? node.name : "";
    if (!name) continue;
    const idx = proxies.findIndex((p) => p && p.name === name);
    if (idx >= 0) proxies[idx] = { ...proxies[idx], ...node };
    else proxies.push({ ...node });
  }
  base.proxies = proxies;
}

function mergeCustomProxyProviders(
  base: Record<string, unknown>,
  custom: Record<string, Record<string, unknown>>,
) {
  const keys = Object.keys(custom);
  if (!keys.length) return;
  const providers =
    base["proxy-providers"] && typeof base["proxy-providers"] === "object"
      ? {
          ...(base["proxy-providers"] as Record<
            string,
            Record<string, unknown>
          >),
        }
      : ({} as Record<string, Record<string, unknown>>);
  for (const [key, val] of Object.entries(custom)) {
    if (!key || !val || typeof val !== "object") continue;
    providers[key] = { ...(providers[key] ?? {}), ...val };
  }
  base["proxy-providers"] = providers;
}

function applyRules(
  base: Record<string, unknown>,
  globalPrepend: string[],
  prepend: string[],
  append: string[],
) {
  let rules = Array.isArray(base.rules)
    ? ([...(base.rules as unknown[])] as unknown[])
    : ["MATCH,DIRECT"];
  if (!rules.length) rules = ["MATCH,DIRECT"];

  const head = [...globalPrepend, ...prepend].filter(
    (r) => typeof r === "string" && r.trim(),
  );
  if (head.length) {
    rules = [...head, ...rules];
  }

  const tail = append
    .map((r) => (typeof r === "string" ? r.trim() : ""))
    .filter(Boolean);
  if (tail.length) {
    // Insert before final MATCH* rule if present
    let matchIdx = -1;
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = String(rules[i] ?? "");
      if (/^MATCH\b/i.test(r) || r.toUpperCase().startsWith("MATCH,")) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx >= 0) {
      rules = [
        ...rules.slice(0, matchIdx),
        ...tail,
        ...rules.slice(matchIdx),
      ];
    } else {
      rules = [...rules, ...tail];
    }
  }
  base.rules = rules;
}

export async function mergeConfig(
  profileYaml: string | null,
  settings: AppSettings,
  secret: string,
  options?: MergeConfigOptions,
): Promise<{ yaml: string; warnings: string[] }> {
  let base: Record<string, unknown> = { ...MINIMAL_BASE };
  if (profileYaml?.trim()) {
    try {
      const parsed = yaml.load(profileYaml) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        base = parsed;
      }
    } catch (e) {
      throw new Error(
        `Invalid profile YAML: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  delete base["external-ui"];
  delete base["external-ui-url"];
  delete base["external-ui-name"];

  // Script overwrite runs on the raw profile map first (FlClash-style)
  const warnings: string[] = [];
  if (options?.scriptId) {
    try {
      const script = readScriptContent(options.scriptId);
      base = await runConfigScript(script, base);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Script overwrite failed: ${msg}`);
      throw new Error(`Script overwrite failed: ${msg}`);
    }
  }

  base["mixed-port"] = settings.mixedPort;
  base["allow-lan"] = settings.allowLan;
  base.mode = settings.mode;
  base["log-level"] = settings.logLevel;
  base["external-controller"] = settings.externalController;
  base.secret = secret;
  base.ipv6 = settings.ipv6;
  // Classic ports (0 = omit/disable)
  if (settings.ports?.port) base.port = settings.ports.port;
  else delete base.port;
  if (settings.ports?.socksPort) base["socks-port"] = settings.ports.socksPort;
  else delete base["socks-port"];
  if (settings.ports?.redirPort) base["redir-port"] = settings.ports.redirPort;
  else delete base["redir-port"];
  if (settings.ports?.tproxyPort) base["tproxy-port"] = settings.ports.tproxyPort;
  else delete base["tproxy-port"];

  base["unified-delay"] = settings.unifiedDelay ?? true;
  base["tcp-concurrent"] = settings.tcpConcurrent ?? true;
  base["find-process-mode"] = settings.findProcessMode ?? "strict";
  base["keep-alive-interval"] = settings.keepAliveInterval ?? 30;
  base["geodata-loader"] = settings.geodataLoader ?? "memconservative";
  if (settings.globalUa?.trim()) {
    base["global-ua"] = settings.globalUa.trim();
  }

  if (settings.hosts && Object.keys(settings.hosts).length > 0) {
    const prevHosts =
      base.hosts && typeof base.hosts === "object" && !Array.isArray(base.hosts)
        ? (base.hosts as Record<string, string>)
        : {};
    base.hosts = { ...prevHosts, ...settings.hosts };
  }

  if (settings.geoxUrl) {
    const gx = settings.geoxUrl;
    if (gx.geoip || gx.geosite || gx.mmdb || gx.asn) {
      base["geox-url"] = {
        geoip: gx.geoip,
        geosite: gx.geosite,
        mmdb: gx.mmdb,
        asn: gx.asn,
      };
    }
  }

  // Align with FlClash desktop TUN patch.
  const prevTun =
    (base.tun as Record<string, unknown> | undefined) ??
    ({} as Record<string, unknown>);
  base.tun = {
    ...prevTun,
    enable: settings.tun,
    stack: prevTun.stack ?? "mixed",
    "auto-route": true,
    "auto-detect-interface": true,
    "dns-hijack": prevTun["dns-hijack"] ?? ["any:53"],
    device: "ClashNode",
    "strict-route": prevTun["strict-route"] ?? false,
  };
  if (process.platform === "win32") {
    (base.tun as Record<string, unknown>)["auto-redirect"] =
      prevTun["auto-redirect"] ?? true;
  }
  delete (base.tun as Record<string, unknown>)["route-address"];

  const hasProfileDns =
    base.dns != null &&
    typeof base.dns === "object" &&
    !Array.isArray(base.dns);

  if (settings.dns.overrideProfile || !hasProfileDns) {
    base.dns = buildDnsBlock(settings.dns);
  } else if (hasProfileDns && settings.dns.enable === false) {
    const profileDns = base.dns as Record<string, unknown>;
    base.dns = { ...profileDns, enable: false };
  }

  // custom proxies / providers before groups so members resolve
  if (options?.customProxies?.length) {
    mergeCustomProxies(base, options.customProxies);
  }
  if (
    options?.customProxyProviders &&
    Object.keys(options.customProxyProviders).length
  ) {
    mergeCustomProxyProviders(base, options.customProxyProviders);
  }

  // Visual custom proxy groups — append / replace by name
  if (options?.customProxyGroups?.length) {
    const groups = Array.isArray(base["proxy-groups"])
      ? ([...(base["proxy-groups"] as Group[])] as Group[])
      : [];
    for (const g of options.customProxyGroups as CustomProxyGroup[]) {
      if (!g?.name) continue;
      const idx = groups.findIndex((x) => x?.name === g.name);
      const entry: Group = {
        name: g.name,
        type: g.type || "select",
        proxies: Array.isArray(g.proxies) ? g.proxies : [],
      };
      if (g.use?.length) entry.use = g.use;
      if (g.icon?.trim()) entry.icon = g.icon.trim();
      if (
        g.type === "url-test" ||
        g.type === "fallback" ||
        g.type === "load-balance"
      ) {
        entry.url = g.url || "http://www.gstatic.com/generate_204";
        entry.interval = g.interval || 300;
      }
      if (idx >= 0) groups[idx] = { ...groups[idx], ...entry };
      else groups.push(entry);
    }
    base["proxy-groups"] = groups;
  }

  const globalPrepend =
    options?.globalPrependRules ?? settings.globalPrependRules ?? [];
  const prepend = options?.prependRules ?? [];
  const append = options?.appendRules ?? [];
  applyRules(base, globalPrepend, prepend, append);

  if (!Array.isArray(base.rules) || base.rules.length === 0) {
    base.rules = ["MATCH,DIRECT"];
  }

  const profileBlock =
    (base.profile as Record<string, unknown> | undefined) ?? {};
  base.profile = {
    ...profileBlock,
    "store-selected": false,
  };

  warnings.push(...sanitizeProxyGraph(base));

  const text = yaml.dump(base, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  return { yaml: text, warnings };
}

export function patchRuntimeConfig(
  settings: Partial<AppSettings>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (settings.mode != null) body.mode = settings.mode;
  if (settings.logLevel != null) body["log-level"] = settings.logLevel;
  if (settings.allowLan != null) body["allow-lan"] = settings.allowLan;
  if (settings.mixedPort != null) body["mixed-port"] = settings.mixedPort;
  if (settings.ipv6 != null) body.ipv6 = settings.ipv6;
  if (settings.tun != null) {
    body.tun = {
      enable: settings.tun,
    };
  }
  return body;
}
