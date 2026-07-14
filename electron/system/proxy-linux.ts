import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_BYPASS } from "../shared/types";

const execFileAsync = promisify(execFile);

async function has(bin: string) {
  try {
    await execFileAsync("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

async function gsettings(...args: string[]) {
  await execFileAsync("gsettings", args);
}

export async function enableSystemProxy(
  port: number,
  bypass: string[] = DEFAULT_BYPASS,
) {
  // Prefer GNOME gsettings; fall back to KDE only if available later
  if (await has("gsettings")) {
    const host = "127.0.0.1";
    await gsettings("set", "org.gnome.system.proxy", "mode", "manual");
    await gsettings("set", "org.gnome.system.proxy.http", "host", host);
    await gsettings(
      "set",
      "org.gnome.system.proxy.http",
      "port",
      String(port),
    );
    await gsettings("set", "org.gnome.system.proxy.https", "host", host);
    await gsettings(
      "set",
      "org.gnome.system.proxy.https",
      "port",
      String(port),
    );
    await gsettings("set", "org.gnome.system.proxy.socks", "host", host);
    await gsettings(
      "set",
      "org.gnome.system.proxy.socks",
      "port",
      String(port),
    );
    // gsettings expects a list string like "['a','b']"
    const list = bypass.map((b) => `'${b.replace(/'/g, "")}'`).join(", ");
    await gsettings(
      "set",
      "org.gnome.system.proxy",
      "ignore-hosts",
      `[${list}]`,
    );
    return;
  }
  throw new Error("Linux system proxy requires gsettings (GNOME)");
}

export async function disableSystemProxy() {
  if (await has("gsettings")) {
    await gsettings("set", "org.gnome.system.proxy", "mode", "none");
    return;
  }
}
