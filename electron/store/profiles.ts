import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Profile, ProfilesState, SubscriptionInfo } from "../shared/types";
import {
  getProfilesDir,
  getProfilesStatePath,
  readJsonFile,
  writeJsonFile,
} from "./paths";

const EMPTY: ProfilesState = { currentId: null, items: [] };

/**
 * Many providers (incl. this one) return different YAML by User-Agent:
 * - clash.meta / FlClash → full proxies + groups
 * - generic / ClashX / CFW → rules-only shell with proxies: []
 * Match FlClash's request UA style.
 */
function subscriptionUa() {
  const plat = process.platform === "win32" ? "windows" : "darwin";
  // Match FlClash-style UA so providers return full proxy lists
  return `clash.meta/v1.19.28 FlClash/v0.8.94 clash-verge Platform/${plat}`;
}

export function loadProfilesState(): ProfilesState {
  const state = readJsonFile<ProfilesState>(getProfilesStatePath(), EMPTY);
  if (!Array.isArray(state.items)) return EMPTY;
  return state;
}

export function saveProfilesState(state: ProfilesState) {
  writeJsonFile(getProfilesStatePath(), state);
}

export function getProfileYamlPath(id: string) {
  return path.join(getProfilesDir(), `${id}.yaml`);
}

export function readProfileYaml(id: string): string | null {
  const p = getProfileYamlPath(id);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function writeProfileYaml(id: string, content: string) {
  fs.writeFileSync(getProfileYamlPath(id), content, "utf8");
}

function parseSubscriptionInfo(header?: string | null): SubscriptionInfo | undefined {
  if (!header) return undefined;
  const info: SubscriptionInfo = {};
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (!k || v == null) continue;
    const n = Number(v);
    if (k === "upload") info.upload = n;
    if (k === "download") info.download = n;
    if (k === "total") info.total = n;
    if (k === "expire") info.expire = n;
  }
  return info;
}

function filenameFromDisposition(header?: string | null): string | undefined {
  if (!header) return undefined;
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(header);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1].replace(/"/g, "")).replace(/\.ya?ml$/i, "");
  } catch {
    return m[1].replace(/"/g, "").replace(/\.ya?ml$/i, "");
  }
}

async function downloadSubscription(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": subscriptionUa(),
      Accept: "text/yaml, text/plain, */*",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  let text = await res.text();
  text = maybeDecodeSubscription(text);
  if (!text.trim()) throw new Error("Empty subscription content");
  assertLooksLikeClashConfig(text);

  // Reject known "empty shell" responses so the UI can retry / show a clear error
  const emptyShell =
    /proxies:\s*\[\s*\]/.test(text) &&
    !/type:\s*(ss|ssr|vmess|vless|trojan|hysteria|anytls|tuic|wireguard|http|socks)/i.test(
      text,
    );
  if (emptyShell) {
    throw new Error(
      "Subscription returned no proxy nodes (proxies: []). Provider may be filtering by User-Agent — try Update again.",
    );
  }

  return {
    text,
    subscriptionInfo: parseSubscriptionInfo(
      res.headers.get("subscription-userinfo"),
    ),
    label: filenameFromDisposition(res.headers.get("content-disposition")),
  };
}

export async function addProfileFromUrl(url: string, name?: string) {
  const { text, subscriptionInfo, label: remoteLabel } =
    await downloadSubscription(url);

  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  writeProfileYaml(id, text);

  const profile: Profile = {
    id,
    name: name || remoteLabel || new URL(url).hostname,
    type: "url",
    url,
    autoUpdate: true,
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    subscriptionInfo,
  };

  const state = loadProfilesState();
  state.items.unshift(profile);
  if (!state.currentId) state.currentId = id;
  saveProfilesState(state);
  return profile;
}

export async function addProfileFromFile(filePath: string, name?: string) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) throw new Error("Empty file");
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  writeProfileYaml(id, text);
  const profile: Profile = {
    id,
    name: name || path.basename(filePath).replace(/\.ya?ml$/i, ""),
    type: "file",
    filePath,
    autoUpdate: false,
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const state = loadProfilesState();
  state.items.unshift(profile);
  if (!state.currentId) state.currentId = id;
  saveProfilesState(state);
  return profile;
}

export async function updateProfile(id: string) {
  const state = loadProfilesState();
  const idx = state.items.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Profile not found");
  const profile = state.items[idx];
  if (profile.type !== "url" || !profile.url) {
    throw new Error("Only URL profiles can be updated");
  }
  const { text, subscriptionInfo, label } = await downloadSubscription(
    profile.url,
  );
  writeProfileYaml(id, text);
  profile.lastUpdated = new Date().toISOString();
  profile.subscriptionInfo = subscriptionInfo;
  profile.error = undefined;
  if (label) profile.name = label;
  state.items[idx] = profile;
  saveProfilesState(state);
  return profile;
}

export function deleteProfile(id: string) {
  const state = loadProfilesState();
  state.items = state.items.filter((p) => p.id !== id);
  if (state.currentId === id) {
    state.currentId = state.items[0]?.id ?? null;
  }
  saveProfilesState(state);
  const yaml = getProfileYamlPath(id);
  if (fs.existsSync(yaml)) fs.unlinkSync(yaml);
  return state;
}

export function setCurrentProfile(id: string | null) {
  const state = loadProfilesState();
  if (id && !state.items.some((p) => p.id === id)) {
    throw new Error("Profile not found");
  }
  state.currentId = id;
  saveProfilesState(state);
  return state;
}

export function renameProfile(id: string, name: string) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === id);
  if (!p) throw new Error("Profile not found");
  p.name = name.trim() || p.name;
  saveProfilesState(state);
  return p;
}

export type ProfileEditPatch = {
  name?: string;
  url?: string;
  autoUpdate?: boolean;
};

/** Edit metadata (name / subscription URL / auto-update flag). */
export function editProfile(id: string, patch: ProfileEditPatch): Profile {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === id);
  if (!p) throw new Error("Profile not found");

  if (patch.name != null) {
    const name = patch.name.trim();
    if (name) p.name = name;
  }

  if (patch.url != null) {
    const url = patch.url.trim();
    if (p.type === "url" || url) {
      if (!url) throw new Error("URL cannot be empty");
      try {
        // validate
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        throw new Error("Invalid URL");
      }
      p.url = url;
      p.type = "url";
      p.filePath = undefined;
    }
  }

  if (patch.autoUpdate != null) {
    p.autoUpdate = !!patch.autoUpdate;
  }

  saveProfilesState(state);
  return p;
}

export function saveProfileContent(id: string, content: string) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === id);
  if (!p) throw new Error("Profile not found");
  const text = content ?? "";
  if (!text.trim()) throw new Error("YAML content is empty");
  writeProfileYaml(id, text);
  p.lastUpdated = new Date().toISOString();
  p.error = undefined;
  saveProfilesState(state);
  return p;
}

export function setSelectedProxy(
  profileId: string,
  group: string,
  name: string,
) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === profileId);
  if (!p) throw new Error("Profile not found");
  p.selectedMap = { ...(p.selectedMap ?? {}), [group]: name };
  saveProfilesState(state);
  return p;
}

export function setPrependRules(profileId: string, rules: string[]) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === profileId);
  if (!p) throw new Error("Profile not found");
  p.prependRules = rules
    .map((r) => r.trim())
    .filter(Boolean);
  saveProfilesState(state);
  return p;
}

export function setProfileScript(profileId: string, scriptId: string | null) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === profileId);
  if (!p) throw new Error("Profile not found");
  p.scriptId = scriptId;
  saveProfilesState(state);
  return p;
}

export function setCustomProxyGroups(
  profileId: string,
  groups: NonNullable<Profile["customProxyGroups"]>,
) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === profileId);
  if (!p) throw new Error("Profile not found");
  p.customProxyGroups = groups;
  saveProfilesState(state);
  return p;
}

export function setCustomRules(profileId: string, rules: string[]) {
  const state = loadProfilesState();
  const p = state.items.find((x) => x.id === profileId);
  if (!p) throw new Error("Profile not found");
  p.customRules = rules.map((r) => r.trim()).filter(Boolean);
  // keep prependRules in sync for older UI paths
  p.prependRules = p.customRules;
  saveProfilesState(state);
  return p;
}

export function reorderProfiles(ids: string[]) {
  const state = loadProfilesState();
  const map = new Map(state.items.map((p) => [p.id, p]));
  const next: typeof state.items = [];
  for (const id of ids) {
    const p = map.get(id);
    if (p) {
      next.push(p);
      map.delete(id);
    }
  }
  for (const p of map.values()) next.push(p);
  state.items = next;
  saveProfilesState(state);
  return state;
}

/** Some providers return base64-encoded YAML or plain share-links. */
function maybeDecodeSubscription(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  // Already YAML-ish
  if (
    /^(mixed-port|port|socks-port|proxies|proxy-groups|proxy-providers|rules|dns|mode)\s*:/m.test(
      trimmed,
    )
  ) {
    return text;
  }

  // Base64 whole document
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 64) {
    try {
      const decoded = Buffer.from(trimmed.replace(/\s+/g, ""), "base64").toString(
        "utf8",
      );
      if (
        /proxies|proxy-groups|proxy-providers|rules/i.test(decoded) ||
        decoded.includes("://")
      ) {
        // If still not YAML but share links, wrap them
        if (!/^\s*[\w-]+:/m.test(decoded) && /:\/\//.test(decoded)) {
          return shareLinksToMinimalYaml(decoded);
        }
        return decoded;
      }
    } catch {
      /* fall through */
    }
  }

  // Raw share links (vmess:// ss:// etc.)
  if (/^(vmess|vless|ss|ssr|trojan|hysteria2?|tuic):\/\//im.test(trimmed)) {
    return shareLinksToMinimalYaml(trimmed);
  }

  return text;
}

function shareLinksToMinimalYaml(body: string): string {
  // Keep as comment block — full URI parsing is provider-specific.
  // User should prefer Clash YAML subscriptions.
  return [
    "proxies: []",
    "proxy-groups:",
    "  - name: PROXY",
    "    type: select",
    "    proxies: [DIRECT]",
    "rules:",
    "  - MATCH,DIRECT",
    "",
    "# Original subscription did not look like Clash YAML.",
    "# Please use a Clash / mihomo format subscription URL.",
    ...body.split(/\r?\n/).map((l) => `# ${l}`),
  ].join("\n");
}

function assertLooksLikeClashConfig(text: string) {
  if (!/proxies|proxy-groups|proxy-providers|rules/i.test(text)) {
    throw new Error(
      "Downloaded content does not look like a Clash/mihomo YAML config",
    );
  }
}
