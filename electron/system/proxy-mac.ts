import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_BYPASS } from "../shared/types";

const execFileAsync = promisify(execFile);

async function listNetworkServices(): Promise<string[]> {
  const { stdout } = await execFileAsync("/usr/sbin/networksetup", [
    "-listallnetworkservices",
  ]);
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.includes("asterisk") && !l.startsWith("An asterisk"));
}

export async function enableSystemProxy(port: number, bypass = DEFAULT_BYPASS) {
  const services = await listNetworkServices();
  const host = "127.0.0.1";
  for (const service of services) {
    try {
      await execFileAsync("/usr/sbin/networksetup", [
        "-setwebproxy",
        service,
        host,
        String(port),
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setsecurewebproxy",
        service,
        host,
        String(port),
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setsocksfirewallproxy",
        service,
        host,
        String(port),
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setwebproxystate",
        service,
        "on",
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setsecurewebproxystate",
        service,
        "on",
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setsocksfirewallproxystate",
        service,
        "on",
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setproxybypassdomains",
        service,
        ...bypass,
      ]);
    } catch {
      // Some services (Thunderbolt Bridge etc.) may fail; ignore.
    }
  }
}

export async function disableSystemProxy() {
  const services = await listNetworkServices();
  for (const service of services) {
    try {
      await execFileAsync("/usr/sbin/networksetup", [
        "-setwebproxystate",
        service,
        "off",
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setsecurewebproxystate",
        service,
        "off",
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setsocksfirewallproxystate",
        service,
        "off",
      ]);
      await execFileAsync("/usr/sbin/networksetup", [
        "-setautoproxystate",
        service,
        "off",
      ]);
    } catch {
      /* ignore */
    }
  }
}
