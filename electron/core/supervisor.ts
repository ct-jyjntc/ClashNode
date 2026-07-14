import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
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
} from "../store/paths";
import { loadProfilesState, readProfileYaml } from "../store/profiles";

export class CoreSupervisor extends EventEmitter {
  private process: ChildProcess | null = null;
  private status: CoreStatus = "stopped";
  private version?: string;
  private error?: string;
  private secret = "";
  private intentionalStop = false;
  private restartAttempts = 0;
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
      tun: settings.tun,
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
        prependRules: current?.prependRules,
        scriptId: current?.scriptId,
      },
    );
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, merged, "utf8");
    if (warnings.length) {
      for (const w of warnings) {
        this.emit("log", { type: "warning", payload: `[config] ${w}` });
      }
    }
    return { configPath, warnings, selectedMap: current?.selectedMap ?? {} };
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

  async start(options?: { forceRestart?: boolean }) {
    if (this.status === "running" && !options?.forceRestart) {
      return this.getState();
    }
    if (this.status === "starting") return this.getState();

    if (this.process) {
      await this.stop(true);
    }

    this.intentionalStop = false;
    this.setStatus("starting");

    const binary = getMihomoPath();
    if (!fs.existsSync(binary)) {
      this.setStatus("error", `mihomo binary not found: ${binary}`);
      throw new Error(this.error);
    }
    try {
      fs.chmodSync(binary, 0o755);
    } catch {
      /* ignore */
    }

    const settings = loadSettings();
    const home = getHomeDir();
    const { configPath, warnings, selectedMap } =
      await this.writeRuntimeConfig(settings);

    // validate
    try {
      await this.testConfig(binary, home, configPath);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const hint = warnings.length
        ? `\n\nConfig notes:\n- ${warnings.join("\n- ")}`
        : "";
      const msg = extractConfigError(raw) + hint;
      this.setStatus("error", msg);
      throw new Error(msg);
    }

    const child = spawn(binary, ["-d", home, "-f", configPath], {
      cwd: home,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process = child;

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

    this.api = new MihomoApi(settings.externalController, this.secret);
    try {
      this.version = await waitForApi(this.api);
      this.restartAttempts = 0;
      this.setStatus("running");
      if (selectedMap && Object.keys(selectedMap).length) {
        await this.applySelectedMap(selectedMap);
      }
      return this.getState();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.stop(true);
      this.setStatus("error", msg);
      throw e;
    }
  }

  private testConfig(binary: string, home: string, configPath: string) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(binary, ["-t", "-d", home, "-f", configPath], {
        cwd: home,
      });
      let err = "";
      child.stderr.on("data", (b) => {
        err += b.toString();
      });
      child.stdout.on("data", (b) => {
        err += b.toString();
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `Config test failed (${code})`));
      });
    });
  }

  async stop(silent = false) {
    this.intentionalStop = true;
    if (!silent) this.setStatus("stopping");
    const proc = this.process;
    this.process = null;
    this.api = null;
    if (proc && !proc.killed) {
      proc.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 3000);
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
    const needRestart =
      this.status === "running" &&
      (settings.mixedPort !== this.getState().mixedPort ||
        settings.externalController !== this.getState().controller ||
        settings.tun !== this.getState().tun);

    if (this.status === "running" && this.api && !needRestart) {
      await this.writeRuntimeConfig(settings);
      await this.api.patchConfigs({
        mode: settings.mode,
        "log-level": settings.logLevel,
        "allow-lan": settings.allowLan,
        "mixed-port": settings.mixedPort,
        ipv6: settings.ipv6,
        tun: { enable: settings.tun },
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

  authorizeTunBinary(): Promise<{ ok: boolean; message: string }> {
    const binary = getMihomoPath();
    const script = `do shell script "chown root:admin ${shellEscape(binary)} && chmod +sx ${shellEscape(binary)}" with administrator privileges`;
    return new Promise((resolve) => {
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
