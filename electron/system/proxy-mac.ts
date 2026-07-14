import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
