import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { AppSettings, CoreState, CoreStatus } from "../shared/types";
import { mergeConfig } from "./config-merger";
import { MihomoApi, waitForApi } from "./api";
import { loadSettings } from "../store/settings";
import {
  getConfigPath,
  getHomeDir,
  getMihomoPath,
  getSecretPath,
  ensureDir,
  ensureWintunBesideMihomo,
} from "../store/paths";
import { loadProfilesState, readProfileYaml } from "../store/profiles";
import { ensureCriticalGeo } from "../store/geo";
import {
  authorizeWindowsTun,
  isTunMarkedElevated,
  isWindowsAdmin,
  markTunElevated,
} from "../system/elevate";
import {
  checkHelperService,
  getCoreToken,
  helperLogs,
  pingHelper,
  registerHelperService,
  startCoreByHelper,
  stopCoreByHelper,
} from "../system/helper";

/** Max time for `mihomo -t` — without this, missing MMDB + GitHub hang freezes UI on "starting". */
const CONFIG_TEST_TIMEOUT_MS = 12_000;
/** Max wall time for a full start attempt before we surface an error. */
const START_WATCHDOG_MS = 90_000;

export class CoreSupervisor extends EventEmitter {
  private process: ChildProcess | null = null;
  /** True when mihomo was launched by the Windows Helper Service (no local ChildProcess). */
  private managedByHelper = false;
  private status: CoreStatus = "stopped";
  private version?: string;
  private error?: string;
  private secret = "";
  private intentionalStop = false;
  private restartAttempts = 0;
  /** Last tun state actually applied to the running process (not settings file). */
  private runtimeTun = false;
  /** Hash of last config that passed `mihomo -t` — skip re-test when unchanged. */
  private lastValidConfigHash: string | null = null;
  /** Prevent overlapping starts; also used to recover from a hung "starting". */
  private startInFlight: Promise<CoreState> | null = null;
  private startBeganAt = 0;
  api: MihomoApi | null = null;

  constructor() {
    super();
    this.secret = this.loadOrCreateSecret();
  }

  private loadOrCreateSecret() {
    const p = getSecretPath();
    if (fs.existsSync(p)) {
      const s = fs.readFileSync(p, "utf8").trim();
      if (s) return s;
    }
    const s = randomBytes(16).toString("hex");
    fs.writeFileSync(p, s, "utf8");
    return s;
  }

  getState(): CoreState {
    const settings = loadSettings();
    return {
      status: this.status,
      version: this.version,
      pid: this.process?.pid,
      error: this.error,
      secret: this.secret,
      controller: settings.externalController,
      mixedPort: settings.mixedPort,
      systemProxy: settings.systemProxy,
      // Prefer runtime TUN (what the process has), fall back to settings when stopped
      tun: this.status === "running" ? this.runtimeTun : settings.tun,
      mode: settings.mode,
    };
  }

  private setStatus(status: CoreStatus, error?: string) {
    this.status = status;
    this.error = error;
    this.emit("state", this.getState());
  }

  async writeRuntimeConfig(settings = loadSettings()) {
    ensureDir(getHomeDir());
    const profiles = loadProfilesState();
    const current = profiles.currentId
      ? profiles.items.find((p) => p.id === profiles.currentId)
      : null;
    const yaml = profiles.currentId
      ? readProfileYaml(profiles.currentId)
      : null;
    const { yaml: merged, warnings } = await mergeConfig(
      yaml,
      settings,
      this.secret,
      {
        prependRules: current?.customRules?.length
          ? current.customRules
          : current?.prependRules,
        scriptId: current?.scriptId,
        customProxyGroups: current?.customProxyGroups,
      },
    );
    const configPath = getConfigPath();
    const configHash = createHash("sha1").update(merged).digest("hex");
    fs.writeFileSync(configPath, merged, "utf8");
    if (warnings.length) {
      for (const w of warnings) {
        this.emit("log", { type: "warning", payload: `[config] ${w}` });
      }
    }
    return {
      configPath,
      warnings,
      selectedMap: current?.selectedMap ?? {},
      configHash,
    };
  }

  async applySelectedMap(selectedMap: Record<string, string>) {
    if (!this.api || this.status !== "running") return;
    for (const [group, name] of Object.entries(selectedMap)) {
      if (!group || !name) continue;
      try {
        await this.api.selectProxy(group, name);
      } catch {
        /* group may not exist in this profile */
      }
    }
  }

  /**
   * Prefer Helper when TUN is on (Windows). Admin process can still spawn
   * directly. Non-TUN always uses local spawn (no elevation needed).
   */
  private async shouldUseHelper(settings: AppSettings): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (!settings.tun) return false;
    if (await isWindowsAdmin()) return false;
    return true;
  }

  async start(options?: { forceRestart?: boolean }) {
    if (this.status === "running" && !options?.forceRestart) {
      return this.getState();
    }

    // If a previous start is hung on "starting", allow recovery after watchdog.
    if (this.startInFlight) {
      const elapsed = Date.now() - this.startBeganAt;
      if (elapsed < START_WATCHDOG_MS && !options?.forceRestart) {
        return this.startInFlight;
      }
      this.emit("log", {
        type: "warning",
        payload: `[core] previous start hung (${elapsed}ms) — forcing retry`,
      });
      this.startInFlight = null;
      try {
        await this.stop(true);
      } catch {
        /* ignore */
      }
    }

    this.startBeganAt = Date.now();
    const work = this.startInner(options).finally(() => {
      if (this.startInFlight === work) this.startInFlight = null;
    });
    this.startInFlight = work;
    return work;
  }

  private async startInner(options?: { forceRestart?: boolean }) {
    if (this.process || this.managedByHelper) {
      await this.stop(true);
    }

    this.intentionalStop = false;
    this.setStatus("starting");

    const binary = getMihomoPath();
    if (!fs.existsSync(binary)) {
      this.setStatus("error", `mihomo binary not found: ${binary}`);
      throw new Error(this.error);
    }
    // Do not chmod if setuid is already set — that would strip TUN privileges
    try {
      const st = fs.statSync(binary);
      if ((st.mode & 0o4000) === 0) {
        fs.chmodSync(binary, 0o755);
      }
    } catch {
      /* ignore */
    }

    // Windows TUN needs wintun.dll next to mihomo
    if (process.platform === "win32") {
      const w = ensureWintunBesideMihomo(binary);
      if (!w.ok) {
        this.emit("log", {
          type: "warning",
          payload: `[tun] ${w.message}`,
        });
      }
    }

    // Pre-fetch geodata so mihomo won't block on GitHub during -t / boot
    this.emit("log", {
      type: "info",
      payload: "[geo] ensuring critical geodata…",
    });
    const geo = await ensureCriticalGeo({
      onLog: (msg) => this.emit("log", { type: "info", payload: msg }),
    });
    if (!geo.ok) {
      this.emit("log", {
        type: "warning",
        payload: `[geo] still missing: ${geo.missing.join(", ")} — start may be slow if mihomo tries to auto-download`,
      });
    }

    const settings = loadSettings();
    const home = getHomeDir();
    const { configPath, warnings, selectedMap, configHash } =
      await this.writeRuntimeConfig(settings);

    // Full `mihomo -t` is expensive; only re-run when merged config changed.
    // Always hard-timeout: missing MMDB previously hung forever on GitHub.
    const needTest =
      !this.lastValidConfigHash || this.lastValidConfigHash !== configHash;
    if (needTest) {
      try {
        this.emit("log", {
          type: "info",
          payload: "[core] testing config…",
        });
        await this.testConfig(binary, home, configPath);
        this.lastValidConfigHash = configHash;
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        // Timeout: skip gate and try real start (user sees logs if it still fails)
        if (/timed out/i.test(raw)) {
          this.emit("log", {
            type: "warning",
            payload: `[core] config test timed out — starting anyway. ${raw}`,
          });
        } else {
          const hint = warnings.length
            ? `\n\nConfig notes:\n- ${warnings.join("\n- ")}`
            : "";
          const msg = extractConfigError(raw) + hint;
          this.setStatus("error", msg);
          throw new Error(msg);
        }
      }
    }

    const useHelper = await this.shouldUseHelper(settings);
    if (useHelper) {
      await this.startViaHelper(binary, home, configPath, settings);
    } else {
      await this.startLocal(binary, home, configPath, settings);
    }

    this.api = new MihomoApi(settings.externalController, this.secret);
    try {
      this.version = await waitForApi(this.api);
      this.restartAttempts = 0;
      this.setStatus("running");
      // Node selection is non-critical for "started" feedback — fire and forget
      if (selectedMap && Object.keys(selectedMap).length) {
        void this.applySelectedMap(selectedMap);
      }
      return this.getState();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Pull helper logs for diagnosis
      if (useHelper) {
        try {
          const logs = await helperLogs();
          if (logs.trim()) {
            this.emit("log", {
              type: "error",
              payload: `[helper] ${logs.trim().slice(-2000)}`,
            });
          }
        } catch {
          /* ignore */
        }
      }
      await this.stop(true);
      this.setStatus("error", msg);
      throw e;
    }
  }

  private async startLocal(
    binary: string,
    home: string,
    configPath: string,
    settings: AppSettings,
  ) {
    const child = spawn(binary, ["-d", home, "-f", configPath], {
      cwd: home,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = child;
    this.managedByHelper = false;
    this.runtimeTun = !!settings.tun;

    child.stdout?.on("data", (buf: Buffer) => {
      this.emit("log", { type: "info", payload: buf.toString() });
    });
    child.stderr?.on("data", (buf: Buffer) => {
      this.emit("log", { type: "error", payload: buf.toString() });
    });
    child.on("exit", (code, signal) => {
      this.process = null;
      this.api = null;
      if (this.intentionalStop) {
        this.setStatus("stopped");
        return;
      }
      this.setStatus(
        "error",
        `mihomo exited (code=${code}, signal=${signal ?? ""})`,
      );
      if (this.restartAttempts < 2) {
        this.restartAttempts += 1;
        setTimeout(() => {
          void this.start().catch(() => undefined);
        }, 1000);
      }
    });
  }

  private async startViaHelper(
    binary: string,
    home: string,
    configPath: string,
    settings: AppSettings,
  ) {
    const token = getCoreToken(binary);
    let st = await checkHelperService(token);
    if (st !== "running") {
      // Ensure service is installed (UAC once)
      const reg = await registerHelperService(binary);
      if (!reg.ok) {
        this.setStatus("error", reg.message);
        throw new Error(reg.message);
      }
      st = await checkHelperService(token);
    }
    if (st !== "running" || !(await pingHelper(token))) {
      // Token mismatch: service may have been built for another mihomo hash.
      // Retry register (user may need to rebuild helper with current TOKEN).
      const reg2 = await registerHelperService(binary);
      if (!reg2.ok) {
        const msg =
          "Helper service not reachable. Rebuild helper with TOKEN=sha256(mihomo) or run as Administrator.";
        this.setStatus("error", msg);
        throw new Error(msg);
      }
    }

    // Always stop previous helper-managed core first
    await stopCoreByHelper();

    const res = await startCoreByHelper({
      path: binary,
      args: ["-d", home, "-f", configPath],
      cwd: home,
    });
    if (!res.ok) {
      this.setStatus("error", res.message);
      throw new Error(res.message);
    }

    this.process = null;
    this.managedByHelper = true;
    this.runtimeTun = !!settings.tun;
    markTunElevated();
    this.emit("log", {
      type: "info",
      payload: "[helper] mihomo started via ClashNodeHelperService",
    });
  }

  private testConfig(binary: string, home: string, configPath: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(binary, ["-t", "-d", home, "-f", configPath], {
        cwd: home,
        windowsHide: true,
        env: {
          ...process.env,
          // Discourage long auto-downloads during validate if geodata missing
          SKIP_GEOIP_UPDATE: process.env.SKIP_GEOIP_UPDATE ?? "",
        },
      });
      let err = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        try {
          if (process.platform === "win32" && child.pid) {
            spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
          } else {
            child.kill("SIGKILL");
          }
        } catch {
          /* ignore */
        }
        finish(() =>
          reject(
            new Error(
              `Config test timed out after ${CONFIG_TEST_TIMEOUT_MS}ms (often missing geodata / network).`,
            ),
          ),
        );
      }, CONFIG_TEST_TIMEOUT_MS);

      child.stderr?.on("data", (b) => {
        err += b.toString();
      });
      child.stdout?.on("data", (b) => {
        err += b.toString();
      });
      child.on("error", (e) => {
        finish(() => reject(e));
      });
      child.on("close", (code) => {
        if (code === 0) finish(() => resolve());
        else
          finish(() =>
            reject(new Error(err.trim() || `Config test failed (${code})`)),
          );
      });
    });
  }

  async stop(silent = false) {
    this.intentionalStop = true;
    if (!silent) this.setStatus("stopping");

    if (this.managedByHelper) {
      await stopCoreByHelper().catch(() => false);
      this.managedByHelper = false;
    } else if (process.platform === "win32") {
      // Best-effort: clear any leftover helper-owned core without blocking long
      void stopCoreByHelper().catch(() => false);
    }

    const proc = this.process;
    this.process = null;
    this.api = null;
    this.runtimeTun = false;
    if (proc && !proc.killed) {
      try {
        if (process.platform === "win32" && proc.pid) {
          // Hard kill tree on Windows
          spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } else {
          proc.kill("SIGTERM");
        }
      } catch {
        /* ignore */
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 600);
        proc.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    this.setStatus("stopped");
    return this.getState();
  }

  async restart() {
    await this.stop(true);
    return this.start({ forceRestart: true });
  }

  async reloadConfig() {
    const settings = loadSettings();
    const { configPath, selectedMap } =
      await this.writeRuntimeConfig(settings);
    if (this.status === "running" && this.api) {
      try {
        await this.api.putConfigs({ path: configPath }, true);
        if (selectedMap && Object.keys(selectedMap).length) {
          await this.applySelectedMap(selectedMap);
        }
        return this.getState();
      } catch {
        return this.restart();
      }
    }
    return this.getState();
  }

  async applySettings(settings: AppSettings) {
    const prevPort = this.getState().mixedPort;
    const prevController = this.getState().controller;
    const prevTun = this.runtimeTun;
    // TUN enable/disable on a live process: FlClash always restarts after
    // privilege grant so setuid / helper takes effect. Patch-only leaves euid as the user.
    const needRestart =
      this.status === "running" &&
      (settings.mixedPort !== prevPort ||
        settings.externalController !== prevController ||
        settings.tun !== prevTun);

    if (this.status === "running" && this.api && !needRestart) {
      await this.writeRuntimeConfig(settings);
      await this.api.patchConfigs({
        mode: settings.mode,
        "log-level": settings.logLevel,
        "allow-lan": settings.allowLan,
        "mixed-port": settings.mixedPort,
        ipv6: settings.ipv6,
      });
      this.setStatus("running");
      return this.getState();
    }

    if (this.status === "running") {
      return this.restart();
    }
    await this.writeRuntimeConfig(settings);
    return this.getState();
  }

  getApi() {
    if (!this.api || this.status !== "running") {
      throw new Error("Core is not running");
    }
    return this.api;
  }

  /**
   * TUN privilege check.
   * - macOS: root-owned + setuid bit on mihomo binary (FlClash)
   * - Windows: admin process OR helper service running OR elevated flag
   */
  async checkTunAuthorized(): Promise<boolean> {
    const binary = getMihomoPath();
    if (!fs.existsSync(binary)) return false;

    if (process.platform === "win32") {
      if (await isWindowsAdmin()) return true;
      const st = await checkHelperService(getCoreToken(binary));
      if (st === "running") return true;
      return isTunMarkedElevated();
    }

    if (process.platform === "darwin") {
      try {
        const st = fs.statSync(binary);
        return st.uid === 0 && (st.mode & 0o4000) !== 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Elevate for TUN. Caller must restart core after success.
   * - macOS: osascript chown root:admin + chmod +sx
   * - Windows: install/start ClashNodeHelperService + firewall prep
   */
  authorizeTunBinary(): Promise<{ ok: boolean; message: string }> {
    return (async () => {
      if (await this.checkTunAuthorized()) {
        return { ok: true, message: "Already authorized" };
      }
      const binary = getMihomoPath();
      if (!fs.existsSync(binary)) {
        return { ok: false, message: `mihomo not found: ${binary}` };
      }

      if (process.platform === "darwin") {
        const script = `do shell script "chown root:admin ${shellEscape(binary)} && chmod +sx ${shellEscape(binary)}" with administrator privileges`;
        return await new Promise<{ ok: boolean; message: string }>((resolve) => {
          const child = spawn("osascript", ["-e", script]);
          let err = "";
          child.stderr.on("data", (b) => {
            err += b.toString();
          });
          child.on("close", (code) => {
            if (code === 0) {
              resolve({ ok: true, message: "Privileges granted" });
            } else {
              resolve({
                ok: false,
                message: err.trim() || "Authorization cancelled or failed",
              });
            }
          });
        });
      }

      if (process.platform === "win32") {
        // 1) Ensure wintun next to binary
        ensureWintunBesideMihomo(binary);
        // 2) Firewall / unblock prep (best-effort)
        const prep = await authorizeWindowsTun(binary);
        // 3) Install helper service (real elevation path)
        const reg = await registerHelperService(binary);
        if (reg.ok) {
          markTunElevated();
          return {
            ok: true,
            message:
              "Helper service ready. Enable TUN and start core — mihomo will run elevated.",
          };
        }
        if (prep.ok) {
          return {
            ok: true,
            message: `${prep.message} (helper install failed: ${reg.message})`,
          };
        }
        return {
          ok: false,
          message: reg.message || prep.message,
        };
      }

      return {
        ok: false,
        message: `TUN authorize unsupported on ${process.platform}`,
      };
    })();
  }
}

function shellEscape(p: string) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

/** Pull the useful line out of mihomo -t noisy logs. */
function extractConfigError(raw: string) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const errLine =
    lines.find((l) => /level=error/i.test(l) || /not found/i.test(l)) ||
    lines.find((l) => /failed/i.test(l)) ||
    lines[lines.length - 1] ||
    raw;
  // msg="..."
  const m = /msg="([^"]+)"/.exec(errLine);
  if (m) return m[1];
  return errLine.slice(0, 500);
}

export function resolveProfilePathForEditor() {
  return path.join(getHomeDir(), "config.yaml");
}
