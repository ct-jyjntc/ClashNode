import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  clipboard,
  nativeImage,
  type NativeImage,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CoreSupervisor } from "../core/supervisor";
import { loadSettings, updateSettings } from "../store/settings";
import { disableSystemProxy, enableSystemProxy } from "./proxy";

/**
 * Desktop tray (FlClash menu order, ClashNode branding).
 * - macOS: painted circle + optional two-line speed (template image)
 * - Windows: ClashNode app icon (not FlClash status_1/2/3)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;
let lastUp = 0;
let lastDown = 0;
let rebuildTimer: NodeJS.Timeout | null = null;
let rebuildFn: (() => Promise<void>) | null = null;
let paintTimer: NodeJS.Timeout | null = null;
let lastPaintKey = "";
let lastIconOnlyKey = "";
let trayHandlers: {
  supervisor: CoreSupervisor;
  getMainWindow: () => BrowserWindow | null;
  onQuit: () => void;
} | null = null;

function resourceSubdir(...parts: string[]) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  const bases = [
    path.join(process.cwd(), "resources"),
    path.join(app.getAppPath(), "resources"),
    path.join(__dirname, "../../resources"),
  ];
  for (const b of bases) {
    const d = path.join(b, ...parts);
    if (fs.existsSync(d) || fs.existsSync(path.dirname(d))) {
      // Prefer a base that actually contains the requested file/dir
      if (fs.existsSync(d)) return d;
    }
  }
  return path.join(bases[0], ...parts);
}

function trayResourceDir() {
  return resourceSubdir("tray");
}

function iconsResourceDir() {
  return resourceSubdir("icons");
}

/**
 * Windows tray: always use ClashNode brand icon.
 * Prefer multi-size .ico, then small PNGs (taskbar looks best at ~16–32px).
 */
function windowsTrayIconPath(): string | null {
  const icons = iconsResourceDir();
  const candidates = [
    path.join(icons, "icon.ico"),
    path.join(icons, "icon-32.png"),
    path.join(icons, "icon-16.png"),
    path.join(icons, "app_icon_32.png"),
    path.join(icons, "app_icon_16.png"),
    path.join(icons, "icon.png"),
    // last resort: packaged product icon next to exe (dev rarely has this)
    path.join(process.resourcesPath || "", "icon.ico"),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/** macOS fallback asset path (template circles still preferred via buildTrayImage). */
function macStatusIconPath() {
  const dir = trayResourceDir();
  const p32 = path.join(dir, "status_1_32.png");
  if (fs.existsSync(p32)) return p32;
  return path.join(dir, "status_1.png");
}

function loadStatusIcon(running: boolean, tun: boolean): NativeImage {
  // Windows notification area: ClashNode product icon only
  if (process.platform === "win32") {
    const p = windowsTrayIconPath();
    if (p) {
      try {
        let img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          const size = img.getSize();
          // Taskbar tray is ~16px logical; keep a crisp size
          if (size.width > 32 || size.height > 32) {
            img = img.resize({ width: 16, height: 16, quality: "best" });
          } else if (size.width > 16 || size.height > 16) {
            img = img.resize({ width: 16, height: 16, quality: "best" });
          }
          return img;
        }
      } catch {
        /* fall through */
      }
    }
  }

  // macOS / fallback path assets
  const p =
    process.platform === "darwin"
      ? macStatusIconPath()
      : windowsTrayIconPath() || macStatusIconPath();
  if (p && fs.existsSync(p)) {
    let img = nativeImage.createFromPath(p);
    const size = img.getSize();
    if (size.width > 32 || size.height > 32) {
      img = img.resize({ width: 24, height: 24, quality: "best" });
    }
    if (process.platform === "darwin") {
      img.setTemplateImage(true);
    }
    return img;
  }
  // Fallback: painted circle only
  return buildTrayImage({
    running,
    tun,
    showSpeed: false,
    up: 0,
    down: 0,
  });
}

// ---------------------------------------------------------------------------
// Speed formatting (FlClash shortTraffic)
// ---------------------------------------------------------------------------

function shortTraffic(n: number) {
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = Math.max(0, Number(n) || 0);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  // FlClash: "12 KB" + "/s"  →  "12 KB/s"
  return `${Math.round(size)} ${units[unitIndex]}`;
}

function speedLines(up: number, down: number) {
  return {
    up: `${shortTraffic(up)}/s`,
    down: `${shortTraffic(down)}/s`,
  };
}

// ---------------------------------------------------------------------------
// 5×7 bitmap font (template-black glyphs)
// ---------------------------------------------------------------------------

/** Each glyph is 5 columns × 7 rows of 0/1. */
const FONT: Record<string, number[][]> = (() => {
  const g = (rows: string[]): number[][] =>
    rows.map((r) => r.split("").map((c) => (c === "#" ? 1 : 0)));

  return {
    "0": g([" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "]),
    "1": g(["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"]),
    "2": g([" ### ", "#   #", "    #", "  ## ", " #   ", "#    ", "#####"]),
    "3": g([" ### ", "#   #", "    #", "  ## ", "    #", "#   #", " ### "]),
    "4": g(["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "]),
    "5": g(["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "]),
    "6": g(["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "]),
    "7": g(["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "]),
    "8": g([" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "]),
    "9": g([" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "]),
    B: g(["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "]),
    K: g(["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"]),
    M: g(["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"]),
    G: g([" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"]),
    T: g(["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "]),
    s: g(["     ", "     ", " ### ", "#    ", " ### ", "    #", " ####"]),
    "/": g(["    #", "   # ", "  #  ", "  #  ", " #   ", "#    ", "#    "]),
    " ": g(["     ", "     ", "     ", "     ", "     ", "     ", "     "]),
    ".": g(["     ", "     ", "     ", "     ", "     ", "  #  ", "  #  "]),
  };
})();

const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPH_GAP = 1;

function measureText(text: string, scale: number) {
  const n = text.length;
  if (!n) return 0;
  return n * (GLYPH_W * scale) + (n - 1) * (GLYPH_GAP * scale);
}

function drawChar(
  buf: Buffer,
  imgW: number,
  x0: number,
  y0: number,
  ch: string,
  scale: number,
  alpha = 255,
) {
  const glyph = FONT[ch] ?? FONT[" "];
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      if (!glyph[gy][gx]) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const x = x0 + gx * scale + sx;
          const y = y0 + gy * scale + sy;
          if (x < 0 || y < 0 || x >= imgW) continue;
          const i = (y * imgW + x) * 4;
          buf[i] = 0;
          buf[i + 1] = 0;
          buf[i + 2] = 0;
          buf[i + 3] = alpha;
        }
      }
    }
  }
}

function drawText(
  buf: Buffer,
  imgW: number,
  x0: number,
  y0: number,
  text: string,
  scale: number,
  alpha = 255,
) {
  let x = x0;
  const step = GLYPH_W * scale + GLYPH_GAP * scale;
  for (const ch of text) {
    drawChar(buf, imgW, x, y0, ch, scale, alpha);
    x += step;
  }
}

function fillCircle(
  buf: Buffer,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  r: number,
  alpha = 255,
  hollow = false,
  innerR = 0,
) {
  const r2 = r * r;
  const ir2 = innerR * innerR;
  const minX = Math.max(0, Math.floor(cx - r - 1));
  const maxX = Math.min(imgW - 1, Math.ceil(cx + r + 1));
  const minY = Math.max(0, Math.floor(cy - r - 1));
  const maxY = Math.min(imgH - 1, Math.ceil(cy + r + 1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (hollow && d2 < ir2) continue;
      const i = (y * imgW + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = Math.max(buf[i + 3], alpha);
    }
  }
}

// ---------------------------------------------------------------------------
// Composite tray image: circle + optional two-line speed (FlClash layout)
// ---------------------------------------------------------------------------

/**
 * Fixed layout so the menu bar item never resizes as speeds change.
 * shortTraffic max width is "1023 GB/s" (9 glyphs with our font).
 */
const TRAY_SCALE = 2; // @2x
const TRAY_H = 22 * TRAY_SCALE;
const TRAY_PAD_X = 2 * TRAY_SCALE;
const TRAY_CIRCLE_R = 5 * TRAY_SCALE;
const TRAY_GAP = 4 * TRAY_SCALE;
const TRAY_FONT_SCALE = 2; // 5×7 → 10×14 px
/** Widest speed label we ever paint (keeps canvas width constant). */
const TRAY_SPEED_MAX_CHARS = "1023 GB/s".length;
const TRAY_TEXT_SLOT_W = measureText(
  "0".repeat(TRAY_SPEED_MAX_CHARS),
  TRAY_FONT_SCALE,
);
const TRAY_RIGHT_PAD = 3 * TRAY_SCALE;
/** Full width with speed statistics on. */
const TRAY_W_SPEED = Math.ceil(
  TRAY_PAD_X + TRAY_CIRCLE_R * 2 + TRAY_GAP + TRAY_TEXT_SLOT_W + TRAY_RIGHT_PAD,
);
/** Icon-only width (speed stats off). */
const TRAY_W_ICON = Math.ceil(TRAY_PAD_X * 2 + TRAY_CIRCLE_R * 2);

/**
 * Build a @2x template image for the menu bar (~22pt tall).
 * Fixed width when speed is shown so the menu bar doesn't jitter.
 */
function buildTrayImage(opts: {
  running: boolean;
  tun: boolean;
  showSpeed: boolean;
  up: number;
  down: number;
}): NativeImage {
  const imgW = opts.showSpeed ? TRAY_W_SPEED : TRAY_W_ICON;
  const imgH = TRAY_H;
  const circleCx = TRAY_PAD_X + TRAY_CIRCLE_R;
  const circleCy = imgH / 2;
  const circleR = opts.running ? TRAY_CIRCLE_R + TRAY_SCALE * 0.5 : TRAY_CIRCLE_R;

  const buf = Buffer.alloc(imgW * imgH * 4, 0);

  if (!opts.running) {
    fillCircle(
      buf,
      imgW,
      imgH,
      circleCx,
      circleCy,
      circleR,
      255,
      true,
      circleR - 2.2 * TRAY_SCALE,
    );
  } else if (opts.tun) {
    fillCircle(
      buf,
      imgW,
      imgH,
      circleCx,
      circleCy,
      circleR - 1.5 * TRAY_SCALE,
      255,
    );
    fillCircle(
      buf,
      imgW,
      imgH,
      circleCx,
      circleCy,
      circleR + 0.5 * TRAY_SCALE,
      255,
      true,
      circleR - 0.2 * TRAY_SCALE,
    );
  } else {
    fillCircle(buf, imgW, imgH, circleCx, circleCy, circleR, 255);
  }

  if (opts.showSpeed) {
    const { up: lineUp, down: lineDown } = speedLines(opts.up, opts.down);
    const lineH = GLYPH_H * TRAY_FONT_SCALE;
    const blockH = lineH * 2 + 2 * TRAY_SCALE;
    const textTop = Math.round((imgH - blockH) / 2);
    // Fixed text slot starting after the circle; right-align each line inside it
    const slotLeft = Math.round(circleCx + TRAY_CIRCLE_R + TRAY_GAP);
    const slotRight = slotLeft + TRAY_TEXT_SLOT_W;

    const xUp = slotRight - measureText(lineUp, TRAY_FONT_SCALE);
    const xDown = slotRight - measureText(lineDown, TRAY_FONT_SCALE);
    drawText(buf, imgW, xUp, textTop, lineUp, TRAY_FONT_SCALE, 255);
    drawText(
      buf,
      imgW,
      xDown,
      textTop + lineH + 2 * TRAY_SCALE,
      lineDown,
      TRAY_FONT_SCALE,
      255,
    );
  }

  const img = nativeImage.createFromBuffer(buf, {
    width: imgW,
    height: imgH,
    scaleFactor: TRAY_SCALE,
  });
  if (process.platform === "darwin") {
    img.setTemplateImage(true);
  }
  return img;
}

function applyTrayVisual(running: boolean, tun: boolean) {
  if (!tray) return;
  const settings = loadSettings();
  const showSpeed =
    process.platform === "darwin" && !!settings.showTrayTitle;

  const lines = showSpeed ? speedLines(lastUp, lastDown) : { up: "", down: "" };
  // Windows brand icon does not change with running/tun (state is in menu/tooltip).
  // Still track running/tun for tooltip rebuilds and mac paint keys.
  const key =
    process.platform === "win32"
      ? "win-brand"
      : [
          running ? 1 : 0,
          tun ? 1 : 0,
          showSpeed ? 1 : 0,
          lines.up,
          lines.down,
        ].join("|");

  if (key === lastPaintKey) return;
  lastPaintKey = key;
  lastIconOnlyKey = `${running ? 1 : 0}:${tun ? 1 : 0}`;

  try {
    if (process.platform === "darwin") {
      tray.setImage(
        buildTrayImage({
          running,
          tun,
          showSpeed,
          up: lastUp,
          down: lastDown,
        }),
      );
      tray.setTitle("");
    } else {
      tray.setImage(loadStatusIcon(running, tun));
    }
  } catch {
    /* ignore */
  }
}


export function setTrayTraffic(up: number, down: number) {
  lastUp = up;
  lastDown = down;
  if (!tray || process.platform !== "darwin") return;
  const settings = loadSettings();
  if (!settings.showTrayTitle) return;
  // Coalesce high-frequency WS ticks
  if (paintTimer) return;
  paintTimer = setTimeout(() => {
    paintTimer = null;
    // Re-read running/tun from last known icon key
    const [r, t] = lastIconOnlyKey.split(":");
    applyTrayVisual(r === "1", t === "1");
  }, 200);
}

/** Rebuild menu soon (coalesce bursts from traffic/state). */
export function scheduleTrayRebuild() {
  if (!rebuildFn) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    void rebuildFn?.();
  }, 80);
}

function copyEnvVar(port: number) {
  // FlClash-style: export both http(s) and all_proxy / Windows set
  const host = "127.0.0.1";
  if (process.platform === "win32") {
    const text = [
      `set http_proxy=http://${host}:${port}`,
      `set https_proxy=http://${host}:${port}`,
      `set all_proxy=socks5://${host}:${port}`,
    ].join("\r\n");
    clipboard.writeText(text);
    return;
  }
  const text = [
    `export https_proxy=http://${host}:${port} http_proxy=http://${host}:${port} all_proxy=socks5://${host}:${port}`,
    `export HTTPS_PROXY=http://${host}:${port} HTTP_PROXY=http://${host}:${port} ALL_PROXY=socks5://${host}:${port}`,
  ].join("\n");
  clipboard.writeText(text);
}

export function setupTray(
  supervisor: CoreSupervisor,
  getMainWindow: () => BrowserWindow | null,
  onQuit: () => void,
) {
  if (tray) return tray;

  trayHandlers = { supervisor, getMainWindow, onQuit };
  const settings0 = loadSettings();
  const state0 = supervisor.getState();
  lastPaintKey = "";
  lastIconOnlyKey = "";
  const running0 = state0.status === "running";
  if (process.platform === "darwin") {
    tray = new Tray(
      buildTrayImage({
        running: running0,
        tun: settings0.tun,
        showSpeed: settings0.showTrayTitle !== false,
        up: 0,
        down: 0,
      }),
    );
    tray.setTitle("");
  } else {
    tray = new Tray(loadStatusIcon(running0, settings0.tun));
  }
  lastIconOnlyKey = `${running0 ? 1 : 0}:${settings0.tun ? 1 : 0}`;
  tray.setToolTip("ClashNode");

  const rebuild = async () => {
    if (!tray) return;
    const state = supervisor.getState();
    const settings = loadSettings();
    const running = state.status === "running";

    applyTrayVisual(running, settings.tun);

    // Desktop: each group as top-level submenu (FlClash); limit size for UI
    const groupItems: Electron.MenuItemConstructorOptions[] = [];
    if (running) {
      try {
        const proxies = await supervisor.getApi().proxies();
        const groups = Object.values(proxies.proxies || {}).filter(
          (p) =>
            (p.type === "Selector" ||
              p.type === "URLTest" ||
              p.type === "Fallback" ||
              p.type === "LoadBalance") &&
            !p.hidden &&
            Array.isArray(p.all) &&
            p.all.length > 0,
        );
        for (const g of groups.slice(0, 12)) {
          const members = (g.all || []).slice(0, 40);
          groupItems.push({
            label: g.name,
            submenu: members.map((m) => ({
              label: m,
              type: "checkbox" as const,
              checked: m === g.now,
              click: async () => {
                try {
                  await supervisor.getApi().selectProxy(g.name, m);
                } catch {
                  /* ignore */
                }
                scheduleTrayRebuild();
              },
            })),
          });
        }
      } catch {
        /* ignore proxy fetch errors in tray */
      }
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "显示",
        click: () => {
          const win = getMainWindow();
          if (!win) return;
          win.show();
          win.focus();
        },
      },
      {
        label: running ? "停止" : "启动",
        click: async () => {
          try {
            if (running) {
              await supervisor.stop();
              void disableSystemProxy().catch(() => undefined);
              lastUp = 0;
              lastDown = 0;
              lastPaintKey = "";
            } else {
              await supervisor.start();
              const s = loadSettings();
              if (s.systemProxy) {
                void enableSystemProxy(s.mixedPort, s.bypassDomains).catch(
                  () => undefined,
                );
              }
            }
          } catch {
            /* ignore */
          }
          getMainWindow()?.webContents.send(
            "core:state",
            supervisor.getState(),
          );
          scheduleTrayRebuild();
        },
      },
    ];

    if (process.platform === "darwin") {
      template.push({
        label: "网速统计",
        type: "checkbox",
        checked: !!settings.showTrayTitle,
        click: (item) => {
          const next = updateSettings({ showTrayTitle: item.checked });
          getMainWindow()?.webContents.send("settings:changed", next);
          lastPaintKey = "";
          applyTrayVisual(
            supervisor.getState().status === "running",
            loadSettings().tun,
          );
        },
      });
    }

    template.push({ type: "separator" });

    for (const mode of ["rule", "global", "direct"] as const) {
      template.push({
        label: mode === "rule" ? "规则" : mode === "global" ? "全局" : "直连",
        type: "checkbox",
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
          scheduleTrayRebuild();
        },
      });
    }

    template.push({ type: "separator" });

    if (groupItems.length) {
      template.push(...groupItems, { type: "separator" });
    }

    if (running) {
      template.push(
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
              getMainWindow()?.webContents.send(
                "core:state",
                supervisor.getState(),
              );
            } catch {
              item.checked = loadSettings().tun;
            }
            scheduleTrayRebuild();
          },
        },
        {
          label: "系统代理",
          type: "checkbox",
          checked: settings.systemProxy,
          click: (item) => {
            const next = updateSettings({ systemProxy: item.checked });
            getMainWindow()?.webContents.send("settings:changed", next);
            void (async () => {
              try {
                if (
                  item.checked &&
                  supervisor.getState().status === "running"
                ) {
                  await enableSystemProxy(
                    next.mixedPort,
                    next.bypassDomains,
                  );
                } else {
                  await disableSystemProxy();
                }
              } catch {
                /* ignore */
              }
              scheduleTrayRebuild();
            })();
          },
        },
        { type: "separator" },
      );
    }

    template.push(
      {
        label: "开机启动",
        type: "checkbox",
        checked: !!settings.startOnLaunch,
        click: (item) => {
          const next = updateSettings({ startOnLaunch: item.checked });
          try {
            app.setLoginItemSettings({
              openAtLogin: item.checked,
              openAsHidden: false,
            });
          } catch {
            /* ignore */
          }
          getMainWindow()?.webContents.send("settings:changed", next);
        },
      },
      {
        label: "复制环境变量",
        click: () => copyEnvVar(loadSettings().mixedPort),
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => onQuit(),
      },
    );

    const isZh = (app.getLocale() || "").toLowerCase().startsWith("zh");
    if (!isZh) {
      const enMap: Record<string, string> = {
        显示: "Show",
        停止: "Stop",
        启动: "Start",
        网速统计: "Speed statistics",
        规则: "Rule",
        全局: "Global",
        直连: "Direct",
        系统代理: "System proxy",
        开机启动: "Open at login",
        复制环境变量: "Copy env var",
        退出: "Exit",
      };
      for (const item of template) {
        if (item.label && enMap[item.label]) item.label = enMap[item.label];
      }
    }

    tray.setContextMenu(Menu.buildFromTemplate(template));
    const { up, down } = speedLines(lastUp, lastDown);
    tray.setToolTip(
      running
        ? `ClashNode\n↑ ${up}\n↓ ${down}\n:${state.mixedPort}`
        : `ClashNode · ${state.status}`,
    );
  };

  rebuildFn = rebuild;

  supervisor.on("state", () => {
    scheduleTrayRebuild();
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
  if (rebuildTimer) clearTimeout(rebuildTimer);
  if (paintTimer) clearTimeout(paintTimer);
  rebuildTimer = null;
  paintTimer = null;
  rebuildFn = null;
  trayHandlers = null;
  lastPaintKey = "";
  lastIconOnlyKey = "";
  try {
    tray?.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}
