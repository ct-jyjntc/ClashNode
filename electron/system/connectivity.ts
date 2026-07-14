import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CoreSupervisor } from "../core/supervisor";
import { loadSettings } from "../store/settings";
import { disableSystemProxy, enableSystemProxy } from "./proxy";

const execFileAsync = promisify(execFile);

async function getWifiSsid(): Promise<string | null> {
  try {
    if (process.platform === "darwin") {
      // networksetup -getairportnetwork en0
      const { stdout } = await execFileAsync("/usr/sbin/networksetup", [
        "-getairportnetwork",
        "en0",
      ]);
      const m = /Current Wi-Fi Network:\s*(.+)$/m.exec(stdout.trim());
      return m?.[1]?.trim() || null;
    }
    if (process.platform === "linux") {
      const { stdout } = await execFileAsync("iwgetid", ["-r"]);
      return stdout.trim() || null;
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netsh", [
        "wlan",
        "show",
        "interfaces",
      ]);
      const m = /^\s*SSID\s*:\s*(.+)$/m.exec(stdout);
      return m?.[1]?.trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

let timer: NodeJS.Timeout | null = null;
let lastSsid: string | null | undefined;

export function startOnDemandMonitor(
  supervisor: CoreSupervisor,
  onLog?: (msg: string) => void,
) {
  stopOnDemandMonitor();
  timer = setInterval(() => {
    void tick(supervisor, onLog);
  }, 15_000);
  void tick(supervisor, onLog);
}

export function stopOnDemandMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(
  supervisor: CoreSupervisor,
  onLog?: (msg: string) => void,
) {
  const settings = loadSettings();
  if (!settings.onDemand?.enabled) return;

  const ssid = await getWifiSsid();
  if (ssid === lastSsid) return;
  lastSsid = ssid;

  const allowed = settings.onDemand.ssids || [];
  const match =
    !allowed.length || (ssid != null && allowed.includes(ssid));

  try {
    if (match) {
      if (supervisor.getState().status !== "running") {
        onLog?.(`[on-demand] SSID "${ssid ?? "unknown"}" → start core`);
        await supervisor.start();
        if (settings.systemProxy) {
          await enableSystemProxy(settings.mixedPort, settings.bypassDomains);
        }
      }
    } else if (settings.onDemand.pauseWhenOffline || allowed.length) {
      if (supervisor.getState().status === "running") {
        onLog?.(
          `[on-demand] SSID "${ssid ?? "none"}" not in allow-list → stop core`,
        );
        await supervisor.stop();
        await disableSystemProxy();
      }
    }
  } catch (e) {
    onLog?.(
      `[on-demand] error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
