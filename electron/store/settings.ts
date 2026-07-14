import {
  DEFAULT_DNS,
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type DnsSettings,
  type HotkeySettings,
} from "../shared/types";
import { getSettingsPath, readJsonFile, writeJsonFile } from "./paths";

function normalizeDns(raw: Partial<DnsSettings> | undefined): DnsSettings {
  const d = { ...DEFAULT_DNS, ...(raw ?? {}) };
  return {
    enable: !!d.enable,
    overrideProfile: !!d.overrideProfile,
    enhancedMode: d.enhancedMode ?? "fake-ip",
    fakeIpRange: d.fakeIpRange || DEFAULT_DNS.fakeIpRange,
    defaultNameserver: Array.isArray(d.defaultNameserver)
      ? d.defaultNameserver.filter(Boolean)
      : [...DEFAULT_DNS.defaultNameserver],
    nameserver: Array.isArray(d.nameserver)
      ? d.nameserver.filter(Boolean)
      : [...DEFAULT_DNS.nameserver],
    fallback: Array.isArray(d.fallback)
      ? d.fallback.filter(Boolean)
      : [...DEFAULT_DNS.fallback],
  };
}

function normalizeHotkeys(
  raw: Partial<HotkeySettings> | undefined,
): HotkeySettings {
  const h = { ...DEFAULT_HOTKEYS, ...(raw ?? {}) };
  return {
    toggleCore: h.toggleCore ?? "",
    toggleSystemProxy: h.toggleSystemProxy ?? "",
    toggleTun: h.toggleTun ?? "",
    showWindow: h.showWindow ?? "",
  };
}

export function loadSettings(): AppSettings {
  const raw = readJsonFile<Partial<AppSettings>>(getSettingsPath(), {});
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    bypassDomains: Array.isArray(raw.bypassDomains)
      ? raw.bypassDomains.filter(Boolean)
      : [...DEFAULT_SETTINGS.bypassDomains],
    dns: normalizeDns(raw.dns),
    hotkeys: normalizeHotkeys(raw.hotkeys),
  };
  return merged;
}

export function saveSettings(settings: AppSettings) {
  writeJsonFile(getSettingsPath(), settings);
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const prev = loadSettings();
  const next: AppSettings = {
    ...prev,
    ...patch,
    bypassDomains:
      patch.bypassDomains != null
        ? patch.bypassDomains.filter(Boolean)
        : prev.bypassDomains,
    dns: patch.dns
      ? normalizeDns({ ...prev.dns, ...patch.dns })
      : prev.dns,
    hotkeys: patch.hotkeys
      ? normalizeHotkeys({ ...prev.hotkeys, ...patch.hotkeys })
      : prev.hotkeys,
  };
  saveSettings(next);
  return next;
}

/** Parse textarea (newline / comma) into clean list. */
export function parseLineList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatLineList(list: string[]): string {
  return list.join("\n");
}
