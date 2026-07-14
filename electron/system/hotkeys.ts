import { BrowserWindow, globalShortcut } from "electron";
import type { CoreSupervisor } from "../core/supervisor";
import { loadSettings, updateSettings } from "../store/settings";
import { disableSystemProxy, enableSystemProxy } from "./proxy-mac";
import type { HotkeySettings } from "../shared/types";

type HotkeyHandlers = {
  getMainWindow: () => BrowserWindow | null;
  supervisor: CoreSupervisor;
  startTraffic: () => void;
  stopTraffic: () => void;
  broadcastState: () => void;
};

let handlers: HotkeyHandlers | null = null;
const registered = new Set<string>();

function clearAll() {
  for (const acc of registered) {
    try {
      globalShortcut.unregister(acc);
    } catch {
      /* ignore */
    }
  }
  registered.clear();
}

function registerOne(accelerator: string, action: () => void) {
  const acc = accelerator.trim();
  if (!acc) return;
  try {
    const ok = globalShortcut.register(acc, action);
    if (ok) registered.add(acc);
    else {
      handlers
        ?.getMainWindow()
        ?.webContents.send("core:log", {
          type: "warning",
          payload: `[hotkey] failed to register: ${acc}`,
        });
    }
  } catch (e) {
    handlers?.getMainWindow()?.webContents.send("core:log", {
      type: "warning",
      payload: `[hotkey] error ${acc}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
  }
}

async function toggleCore() {
  if (!handlers) return;
  const { supervisor, startTraffic, stopTraffic, broadcastState } = handlers;
  try {
    if (supervisor.getState().status === "running") {
      await supervisor.stop();
      await disableSystemProxy();
      stopTraffic();
    } else {
      await supervisor.start();
      const settings = loadSettings();
      if (settings.systemProxy) {
        await enableSystemProxy(settings.mixedPort, settings.bypassDomains);
      }
      startTraffic();
    }
    broadcastState();
  } catch (e) {
    handlers.getMainWindow()?.webContents.send("core:log", {
      type: "error",
      payload: `[hotkey] toggle core: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
  }
}

async function toggleSystemProxy() {
  if (!handlers) return;
  try {
    const prev = loadSettings();
    const next = updateSettings({ systemProxy: !prev.systemProxy });
    const running = handlers.supervisor.getState().status === "running";
    if (running && next.systemProxy) {
      await enableSystemProxy(next.mixedPort, next.bypassDomains);
    } else {
      await disableSystemProxy();
    }
    handlers.getMainWindow()?.webContents.send("settings:changed", next);
  } catch (e) {
    handlers.getMainWindow()?.webContents.send("core:log", {
      type: "error",
      payload: `[hotkey] toggle system proxy: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
  }
}

async function toggleTun() {
  if (!handlers) return;
  try {
    const prev = loadSettings();
    const enable = !prev.tun;
    if (enable) {
      const auth = await handlers.supervisor.authorizeTunBinary();
      if (!auth.ok) {
        handlers.getMainWindow()?.webContents.send("core:log", {
          type: "error",
          payload: `[hotkey] TUN auth: ${auth.message}`,
        });
        return;
      }
    }
    const next = updateSettings({ tun: enable });
    await handlers.supervisor.applySettings(next);
    handlers.getMainWindow()?.webContents.send("settings:changed", next);
    handlers.broadcastState();
  } catch (e) {
    handlers.getMainWindow()?.webContents.send("core:log", {
      type: "error",
      payload: `[hotkey] toggle TUN: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
  }
}

function showWindow() {
  const win = handlers?.getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function registerHotkeys(
  keys: HotkeySettings,
  h: HotkeyHandlers,
) {
  handlers = h;
  clearAll();
  registerOne(keys.toggleCore, () => {
    void toggleCore();
  });
  registerOne(keys.toggleSystemProxy, () => {
    void toggleSystemProxy();
  });
  registerOne(keys.toggleTun, () => {
    void toggleTun();
  });
  registerOne(keys.showWindow, () => {
    showWindow();
  });
}

export function unregisterHotkeys() {
  clearAll();
  handlers = null;
}
