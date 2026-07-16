import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { DEFAULT_BYPASS } from "../shared/types";

const execFileAsync = promisify(execFile);
const NETWORKSETUP = "/usr/sbin/networksetup";

let servicesCache: { at: number; list: string[] } | null = null;
const SERVICES_TTL_MS = 30_000;

/** Last applied desired state — skip no-op toggles. */
let lastApplied: { enabled: boolean; port: number; bypassKey: string } | null =
  null;

async function listServices(): Promise<string[]> {
  const now = Date.now();
  if (servicesCache && now - servicesCache.at < SERVICES_TTL_MS) {
    return servicesCache.list;
  }
  const { stdout } = await execFileAsync(NETWORKSETUP, [
    "-listallnetworkservices",
  ]);
  const list = stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !s.startsWith("An asterisk") &&
        !s.startsWith("*"), // disabled services
    );
  servicesCache = { at: now, list };
  return list;
}

/**
 * Run many networksetup invocations in one /bin/sh process.
 * Spawning networksetup once per flag is the main latency source on macOS.
 */
function runNetworksetupScript(lines: string[]) {
  if (!lines.length) return Promise.resolve();
  // networksetup path is fixed; args are already shell-quoted below
  return execFileAsync("/bin/sh", ["-c", lines.join("\n")], {
    timeout: 15_000,
  }).then(() => undefined);
}

function q(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function ns(...args: string[]) {
  return `${NETWORKSETUP} ${args.map(q).join(" ")}`;
}

/**
 * Enable system HTTP/HTTPS/SOCKS on every active network service.
 * FlClash-style full coverage, but batched: one shell per service, all
 * services in parallel (not N×7 serial networksetup spawns).
 */
export async function enableSystemProxy(
  port: number,
  bypass = DEFAULT_BYPASS,
) {
  const host = "127.0.0.1";
  const portStr = String(port);
  const bypassArgs = bypass.length ? bypass : ["Empty"];
  const bypassKey = bypassArgs.join("\n");

  if (
    lastApplied?.enabled &&
    lastApplied.port === port &&
    lastApplied.bypassKey === bypassKey
  ) {
    return;
  }

  const services = await listServices();
  await Promise.all(
    services.map((service) =>
      runNetworksetupScript([
        ns("-setwebproxy", service, host, portStr),
        ns("-setsecurewebproxy", service, host, portStr),
        ns("-setsocksfirewallproxy", service, host, portStr),
        ns("-setproxybypassdomains", service, ...bypassArgs),
        ns("-setwebproxystate", service, "on"),
        ns("-setsecurewebproxystate", service, "on"),
        ns("-setsocksfirewallproxystate", service, "on"),
      ]).catch(() => undefined),
    ),
  );

  lastApplied = { enabled: true, port, bypassKey };
}

export async function disableSystemProxy() {
  if (lastApplied && !lastApplied.enabled) return;

  const services = await listServices();
  await Promise.all(
    services.map((service) =>
      runNetworksetupScript([
        ns("-setwebproxystate", service, "off"),
        ns("-setsecurewebproxystate", service, "off"),
        ns("-setsocksfirewallproxystate", service, "off"),
        ns("-setautoproxystate", service, "off"),
      ]).catch(() => undefined),
    ),
  );

  lastApplied = { enabled: false, port: 0, bypassKey: "" };
}

/** Drop caches (e.g. after network change). */
export function invalidateProxyCache() {
  servicesCache = null;
  lastApplied = null;
}

// ── System DNS (macOS networksetup) ─────────────────────────────────────────

type DnsBackup = Record<string, string[]>;

function dnsBackupPath() {
  return path.join(app.getPath("userData"), "system-dns-backup.json");
}

function readDnsBackup(): DnsBackup {
  try {
    const p = dnsBackupPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8")) as DnsBackup;
  } catch {
    return {};
  }
}

function writeDnsBackup(data: DnsBackup) {
  try {
    fs.writeFileSync(dnsBackupPath(), JSON.stringify(data, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

async function getDnsServers(service: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(NETWORKSETUP, [
      "-getdnsservers",
      service,
    ]);
    const lines = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.some((l) => /aren't any DNS/i.test(l) || /There aren/i.test(l))) {
      return [];
    }
    return lines.filter((l) => !/DNS Servers/i.test(l));
  } catch {
    return [];
  }
}

/** Apply DNS servers to all active network services; backup previous values. */
export async function applySystemDns(servers: string[]) {
  const list = servers.map((s) => s.trim()).filter(Boolean);
  if (!list.length) {
    throw new Error("DNS server list is empty");
  }
  const services = await listServices();
  const backup = readDnsBackup();
  const shouldBackup = Object.keys(backup).length === 0;

  await Promise.all(
    services.map(async (service) => {
      if (shouldBackup) {
        backup[service] = await getDnsServers(service);
      }
      await runNetworksetupScript([
        ns("-setdnsservers", service, ...list),
      ]).catch(() => undefined);
    }),
  );
  if (shouldBackup) writeDnsBackup(backup);
}

/** Restore DNS from backup (or clear to DHCP/empty). */
export async function restoreSystemDns() {
  const services = await listServices();
  const backup = readDnsBackup();
  await Promise.all(
    services.map(async (service) => {
      const prev = backup[service];
      if (prev && prev.length) {
        await runNetworksetupScript([
          ns("-setdnsservers", service, ...prev),
        ]).catch(() => undefined);
      } else {
        await runNetworksetupScript([
          ns("-setdnsservers", service, "Empty"),
        ]).catch(() => undefined);
      }
    }),
  );
  try {
    const bp = dnsBackupPath();
    if (fs.existsSync(bp)) fs.unlinkSync(bp);
  } catch {
    /* ignore */
  }
}
