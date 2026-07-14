import type {
  ConnectionsSnapshot,
  ProvidersResponse,
  ProxiesResponse,
  ProxyMode,
  RuleItem,
  TrafficSnapshot,
} from "../shared/types";

export class MihomoApi {
  constructor(
    public controller: string,
    public secret: string,
  ) {}

  get base() {
    return `http://${this.controller}`;
  }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.secret) h.Authorization = `Bearer ${this.secret}`;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 8000,
  ): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: this.headers(body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (res.status === 204) return undefined as T;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${method} ${path} → ${res.status} ${text}`);
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        return (await res.json()) as T;
      }
      return (await res.text()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  version() {
    return this.request<{ meta?: boolean; version: string }>("GET", "/version");
  }

  configs() {
    return this.request<Record<string, unknown>>("GET", "/configs");
  }

  patchConfigs(body: Record<string, unknown>) {
    return this.request<void>("PATCH", "/configs", body);
  }

  putConfigs(pathOrPayload: { path?: string; payload?: string }, force = true) {
    const q = force ? "?force=true" : "";
    return this.request<void>("PUT", `/configs${q}`, pathOrPayload, 30000);
  }

  proxies() {
    return this.request<ProxiesResponse>("GET", "/proxies");
  }

  selectProxy(group: string, name: string) {
    return this.request<void>(
      "PUT",
      `/proxies/${encodeURIComponent(group)}`,
      { name },
    );
  }

  delay(name: string, url: string, timeout = 5000) {
    const q = new URLSearchParams({
      url,
      timeout: String(timeout),
    });
    return this.request<{ delay: number }>(
      "GET",
      `/proxies/${encodeURIComponent(name)}/delay?${q}`,
      undefined,
      timeout + 2000,
    );
  }

  connections() {
    return this.request<ConnectionsSnapshot>("GET", "/connections");
  }

  closeConnection(id: string) {
    return this.request<void>("DELETE", `/connections/${encodeURIComponent(id)}`);
  }

  closeAllConnections() {
    return this.request<void>("DELETE", "/connections");
  }

  rules() {
    return this.request<{ rules: RuleItem[] }>("GET", "/rules");
  }

  providers() {
    return this.request<ProvidersResponse>("GET", "/providers/proxies");
  }

  updateProvider(name: string) {
    return this.request<void>(
      "PUT",
      `/providers/proxies/${encodeURIComponent(name)}`,
      undefined,
      60000,
    );
  }

  healthcheckProvider(name: string) {
    return this.request<void>(
      "GET",
      `/providers/proxies/${encodeURIComponent(name)}/healthcheck`,
      undefined,
      120000,
    );
  }

  flushFakeIp() {
    return this.request<void>("POST", "/cache/fakeip/flush");
  }

  flushDns() {
    return this.request<void>("POST", "/cache/dns/flush");
  }

  upgradeGeo() {
    return this.request<void>("POST", "/upgrade/geo", undefined, 120000);
  }

  setMode(mode: ProxyMode) {
    return this.patchConfigs({ mode });
  }

  /** Read one NDJSON-ish traffic line via short-lived HTTP GET stream is awkward;
   *  renderer opens WS. This is a one-shot fallback using connections totals. */
  async trafficFallback(): Promise<TrafficSnapshot> {
    const c = await this.connections();
    return {
      up: 0,
      down: 0,
      upTotal: c.uploadTotal,
      downTotal: c.downloadTotal,
    };
  }
}

export async function waitForApi(
  api: MihomoApi,
  attempts = 60,
  intervalMs = 40,
): Promise<string> {
  let last = "";
  for (let i = 0; i < attempts; i++) {
    try {
      // Short timeout so failed polls don't sit on 8s fetch abort
      const v = await api.request<{ version: string }>(
        "GET",
        "/version",
        undefined,
        400,
      );
      return v.version;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      // Back off slightly after the first few spins
      const wait = i < 8 ? intervalMs : Math.min(120, intervalMs + i * 4);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`mihomo API not ready: ${last}`);
}
