/**
 * Open-at-login via Electron setLoginItemSettings (macOS + Windows).
 */
import { app } from "electron";

export function applyLoginItem(enabled: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });
  } catch {
    /* ignore */
  }
}
