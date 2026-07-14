import yaml from "js-yaml";
import type { AppSettings, DnsSettings } from "../shared/types";

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

export function mergeConfig(
  profileYaml: string | null,
  settings: AppSettings,
  secret: string,
): { yaml: string; warnings: string[] } {
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

  base["mixed-port"] = settings.mixedPort;
  base["allow-lan"] = settings.allowLan;
  base.mode = settings.mode;
  base["log-level"] = settings.logLevel;
  base["external-controller"] = settings.externalController;
  base.secret = secret;
  base.ipv6 = settings.ipv6;
  base["unified-delay"] = base["unified-delay"] ?? true;
  base["tcp-concurrent"] = base["tcp-concurrent"] ?? true;
  base["find-process-mode"] = base["find-process-mode"] ?? "strict";

  const tun =
    (base.tun as Record<string, unknown> | undefined) ??
    ({} as Record<string, unknown>);
  base.tun = {
    ...tun,
    enable: settings.tun,
    stack: tun.stack ?? "mixed",
    "auto-route": true,
    "auto-detect-interface": true,
    "dns-hijack": tun["dns-hijack"] ?? ["any:53"],
    device: tun.device ?? "utunClashNode",
  };

  const hasProfileDns =
    base.dns != null &&
    typeof base.dns === "object" &&
    !Array.isArray(base.dns);

  if (settings.dns.overrideProfile || !hasProfileDns) {
    base.dns = buildDnsBlock(settings.dns);
  } else if (hasProfileDns && settings.dns.enable === false) {
    // Soft-disable: keep profile DNS object but mark enable false
    const profileDns = base.dns as Record<string, unknown>;
    base.dns = { ...profileDns, enable: false };
  }

  if (!Array.isArray(base.rules) || base.rules.length === 0) {
    base.rules = ["MATCH,DIRECT"];
  }

  const warnings = sanitizeProxyGraph(base);

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
