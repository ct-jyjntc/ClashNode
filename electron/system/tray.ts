import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
} from "electron";
import type { CoreSupervisor } from "../core/supervisor";
import type { AppSettings } from "../shared/types";
import { loadSettings, updateSettings } from "../store/settings";
import { disableSystemProxy, enableSystemProxy } from "./proxy-mac";

let tray: Tray | null = null;

function createTrayIcon() {
  // 16x16 monochrome template-style PNG as data URL (simple filled circle)
  const size = 16;
  // Use empty template image; Electron will tint on macOS if isTemplate
  const image = nativeImage.createEmpty();
  // Fallback: generate a simple black square buffer via nativeImage from bitmap
  const buf = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const inside = dx * dx + dy * dy <= 36;
      const i = (y * size + x) * 4;
      if (inside) {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 255;
      }
    }
  }
  const img = nativeImage.createFromBuffer(buf, { width: size, height: size });
  img.setTemplateImage(true);
  return img;
}

export function setupTray(
  supervisor: CoreSupervisor,
  getMainWindow: () => BrowserWindow | null,
  onQuit: () => void,
) {
  if (tray) return tray;
  tray = new Tray(createTrayIcon());
  tray.setToolTip("ClashNode");

  const rebuild = () => {
    const state = supervisor.getState();
    const settings = loadSettings();
    const running = state.status === "running";
    const menu = Menu.buildFromTemplate([
      {
        label: running ? "Stop" : "Start",
        click: async () => {
          try {
            if (running) {
              await supervisor.stop();
              await disableSystemProxy();
            } else {
              await supervisor.start();
              if (settings.systemProxy) {
                await enableSystemProxy(settings.mixedPort, settings.bypassDomains);
              }
            }
          } catch {
            /* ignore */
          }
          rebuild();
        },
      },
      { type: "separator" },
      {
        label: "Mode",
        submenu: (["rule", "global", "direct"] as const).map((mode) => ({
          label: mode,
          type: "radio" as const,
          checked: settings.mode === mode,
          click: async () => {
            const next = updateSettings({ mode });
            try {
              if (supervisor.getState().status === "running") {
                await supervisor.getApi().setMode(mode);
              }
            } catch {
              /* ignore */
            }
            void next;
            rebuild();
            getMainWindow()?.webContents.send("settings:changed", loadSettings());
          },
        })),
      },
      {
        label: "System Proxy",
        type: "checkbox",
        checked: settings.systemProxy,
        click: async (item) => {
          const next = updateSettings({ systemProxy: item.checked });
          try {
            if (item.checked && supervisor.getState().status === "running") {
              await enableSystemProxy(next.mixedPort, next.bypassDomains);
            } else {
              await disableSystemProxy();
            }
          } catch {
            /* ignore */
          }
          getMainWindow()?.webContents.send("settings:changed", loadSettings());
          rebuild();
        },
      },
      { type: "separator" },
      {
        label: "Show Window",
        click: () => {
          const win = getMainWindow();
          if (win) {
            win.show();
            win.focus();
          }
        },
      },
      {
        label: "Quit",
        click: () => onQuit(),
      },
    ]);
    tray?.setContextMenu(menu);
    tray?.setToolTip(
      running
        ? `ClashNode · running · :${state.mixedPort}`
        : `ClashNode · ${state.status}`,
    );
  };

  supervisor.on("state", rebuild);
  tray.on("click", () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isVisible()) win.focus();
    else win.show();
  });

  rebuild();
  return tray;
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}

export type SettingsPatch = Partial<AppSettings>;
