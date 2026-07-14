export function getApi() {
  if (!window.clashnode) {
    throw new Error(
      "ClashNode bridge unavailable — preload failed or not running in Electron",
    );
  }
  return window.clashnode;
}

export function hasApi() {
  return typeof window !== "undefined" && !!window.clashnode;
}

export async function safeInvoke<T>(
  fn: () => Promise<T>,
  fallback?: T,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}
