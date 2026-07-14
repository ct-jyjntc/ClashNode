import {
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  nativeImage,
} from "electron";
import type { CoreSupervisor } from "../core/supervisor";
import type { AppSettings } from "../shared/types";
import { loadSettings, updateSettings } from "../store/settings";
import { disableSystemProxy, enableSystemProxy } from "./proxy-mac";

let tray: Tray | null = null;
let lastUp = 0;
let lastDown = 0;

function createTrayIcon() {
  const size = 16;
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

function fmtSpeed(n: number) {
  if (n < 1024) return `${Math.round(n)} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB/s`;
  return `${(n / 1024 / 1024).toFixed(1)} MB/s`;
}

export function setTrayTraffic(up: number, down: number) {
  lastUp = up;
  lastDown = down;
  if (!tray) return;
  const stateTip = tray.getTitle?.() ?? "";
  void stateTip;
  try {
    tray.setTitle(`↑${fmtSpeed(up)} ↓${fmtSpeed(down)}`);
  } catch {
    /* title may be unsupported */
  }
}

export function setupTray(
  supervisor: CoreSupervisor,
  getMainWindow: () => BrowserWindow | null,
  onQuit: () => void,
) {
  if (tray) return tray;
  tray = new Tray(createTrayIcon());
  tray.setToolTip("ClashNode");

  const rebuild = async () => {
    const state = supervisor.getState();
    const settings = loadSettings();
    const running = state.status === "running";

    let groupSubmenu: Electron.MenuItemConstructorOptions[] = [];
    if (running) {
      try {
        const proxies = await supervisor.getApi().proxies();
        const groups = Object.values(proxies.proxies || {}).filter(
          (p) =>
            p.type === "Selector" ||
            p.type === "URLTest" ||
            p.type === "Fallback",
        );
        // Prefer primary selector groups (limit menu size)
        for (const g of groups.slice(0, 6)) {
          const members = (g.all || []).slice(0, 20);
          groupSubmenu.push({
            label: g.name,
            submenu: members.map((m) => ({
              label: m === g.now ? `✓ ${m}` : m,
              type: "radio" as const,
              checked: m === g.now,
              click: async () => {
                try {
                  await supervisor.getApi().selectProxy(g.name, m);
                } catch {
                  /* ignore */
                }
                void rebuild();
              },
            })),
          });
        }
      } catch {
        groupSubmenu = [{ label: "(unavailable)", enabled: false }];
      }
    }

    const menu = Menu.buildFromTemplate([
      {
        label: running ? "Stop" : "Start",
        click: async () => {
          try {
            if (running) {
              await supervisor.stop();
              await disableSystemProxy();
              try {
                tray?.setTitle("");
              } catch {
                /* ignore */
              }
            } else {
              await supervisor.start();
              if (settings.systemProxy) {
                await enableSystemProxy(
                  settings.mixedPort,
                  settings.bypassDomains,
                );
              }
            }
          } catch {
            /* ignore */
          }
          void rebuild();
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
            updateSettings({ mode });
            try {
              if (supervisor.getState().status === "running") {
                await supervisor.getApi().setMode(mode);
              }
            } catch {
              /* ignore */
            }
            getMainWindow()?.webContents.send(
              "settings:changed",
              loadSettings(),
            );
            void rebuild();
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
          void rebuild();
        },
      },
      {
        label: "TUN",
        type: "checkbox",
        checked: settings.tun,
        click: async (item) => {
          try {
            if (item.checked) {
              const auth = await supervisor.authorizeTunBinary();
              if (!auth.ok) {
                item.checked = false;
                return;
              }
            }
            const next = updateSettings({ tun: item.checked });
            await supervisor.applySettings(next);
            getMainWindow()?.webContents.send("settings:changed", next);
          } catch {
            /* ignore */
          }
          void rebuild();
        },
      },
      ...(groupSubmenu.length
        ? ([{ type: "separator" as const }, { label: "Proxies", submenu: groupSubmenu }] as const)
        : []),
      { type: "separator" },
      {
        label: "Copy proxy env",
        click: () => {
          const s = loadSettings();
          const host = "127.0.0.1";
          const port = s.mixedPort;
          clipboard.writeText(
            `export https_proxy=http://${host}:${port} http_proxy=http://${host}:${port} all_proxy=socks5://${host}:${port}`,
          );
        },
      },
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

  supervisor.on("state", () => {
    void rebuild();
  });
  tray.on("click", () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isVisible()) win.focus();
    else win.show();
  });

  void rebuild();
  return tray;
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}

export type SettingsPatch = Partial<AppSettings>;
