import { DEFAULT_BYPASS } from "../shared/types";
import * as mac from "./proxy-mac";
import * as win from "./proxy-win";

export async function enableSystemProxy(
  port: number,
  bypass: string[] = DEFAULT_BYPASS,
) {
  if (process.platform === "darwin") {
    return mac.enableSystemProxy(port, bypass);
  }
  if (process.platform === "win32") {
    return win.enableSystemProxy(port, bypass);
  }
  throw new Error(`System proxy unsupported on ${process.platform}`);
}

export async function disableSystemProxy() {
  if (process.platform === "darwin") {
    return mac.disableSystemProxy();
  }
  if (process.platform === "win32") {
    return win.disableSystemProxy();
  }
}

export async function applySystemDns(servers: string[]) {
  if (process.platform === "darwin") {
    return mac.applySystemDns(servers);
  }
  // Windows/Linux: no-op for now
  return;
}

export async function restoreSystemDns() {
  if (process.platform === "darwin") {
    return mac.restoreSystemDns();
  }
  return;
}
