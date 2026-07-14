import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getHomeDir, ensureDir, readJsonFile, writeJsonFile } from "./paths";

export interface ScriptItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptsState {
  items: ScriptItem[];
}

const EMPTY: ScriptsState = { items: [] };

export const DEFAULT_SCRIPT = `// ClashNode script overwrite
// Export a main(config) that receives the merged config object and returns it.
// Example: prepend a rule, rename a group, filter proxies, etc.

function main(config) {
  // config.rules = ["DOMAIN-SUFFIX,example.com,DIRECT", ...(config.rules || [])];
  return config;
}
`;

function scriptsStatePath() {
  return path.join(getHomeDir(), "scripts.json");
}

export function getScriptsDir() {
  const dir = path.join(getHomeDir(), "scripts");
  ensureDir(dir);
  return dir;
}

export function getScriptPath(id: string) {
  return path.join(getScriptsDir(), `${id}.js`);
}

export function loadScriptsState(): ScriptsState {
  const state = readJsonFile<ScriptsState>(scriptsStatePath(), EMPTY);
  if (!Array.isArray(state.items)) return EMPTY;
  return state;
}

export function saveScriptsState(state: ScriptsState) {
  writeJsonFile(scriptsStatePath(), state);
}

export function listScripts(): ScriptItem[] {
  return loadScriptsState().items;
}

export function readScriptContent(id: string): string {
  const p = getScriptPath(id);
  if (!fs.existsSync(p)) return DEFAULT_SCRIPT;
  return fs.readFileSync(p, "utf8");
}

export function createScript(name?: string, content?: string): ScriptItem {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const now = new Date().toISOString();
  const item: ScriptItem = {
    id,
    name: (name || "Script").trim() || "Script",
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(getScriptPath(id), content ?? DEFAULT_SCRIPT, "utf8");
  const state = loadScriptsState();
  state.items.unshift(item);
  saveScriptsState(state);
  return item;
}

export function renameScript(id: string, name: string): ScriptItem {
  const state = loadScriptsState();
  const item = state.items.find((s) => s.id === id);
  if (!item) throw new Error("Script not found");
  item.name = name.trim() || item.name;
  item.updatedAt = new Date().toISOString();
  saveScriptsState(state);
  return item;
}

export function saveScriptContent(id: string, content: string): ScriptItem {
  const state = loadScriptsState();
  const item = state.items.find((s) => s.id === id);
  if (!item) throw new Error("Script not found");
  fs.writeFileSync(getScriptPath(id), content ?? "", "utf8");
  item.updatedAt = new Date().toISOString();
  saveScriptsState(state);
  return item;
}

export function deleteScript(id: string): ScriptsState {
  const state = loadScriptsState();
  state.items = state.items.filter((s) => s.id !== id);
  saveScriptsState(state);
  const p = getScriptPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return state;
}
