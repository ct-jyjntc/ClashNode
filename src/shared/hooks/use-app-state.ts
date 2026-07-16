import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { getApi, hasApi } from "@/shared/lib/api";
import { applyUiChrome } from "@/shared/lib/theme-accent";
import type {
  AppSettings,
  CoreState,
  LogLine,
  ProfilesState,
  TrafficSnapshot,
} from "@/entities/mihomo/types";

interface AppStore {
  ready: boolean;
  core: CoreState | null;
  settings: AppSettings | null;
  profiles: ProfilesState | null;
  traffic: TrafficSnapshot;
  logs: LogLine[];
  init: () => Promise<void>;
  refreshCore: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  pushLog: (line: LogLine) => void;
  clearLogs: () => void;
  setTraffic: (t: TrafficSnapshot) => void;
  setCore: (s: CoreState) => void;
  setSettings: (s: AppSettings) => void;
  setProfiles: (p: ProfilesState) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  core: null,
  settings: null,
  profiles: null,
  traffic: { up: 0, down: 0 },
  logs: [],
  init: async () => {
    const api = getApi();
    const [core, settings, profiles] = await Promise.all([
      api.getCoreState(),
      api.getSettings(),
      api.getProfiles(),
    ]);
    applyUiChrome({
      accentColor: settings.accentColor,
      textScale: settings.textScale,
    });
    set({ core, settings, profiles, ready: true });

    if (settings.checkUpdateOnLaunch) {
      void api
        .checkUpdate()
        .then((r) => {
          if (r.hasUpdate && r.latest) {
            toast.message(`mihomo ${r.latest}`, {
              description: r.htmlUrl || undefined,
            });
          }
        })
        .catch(() => undefined);
    }
  },
  refreshCore: async () => {
    set({ core: await getApi().getCoreState() });
  },
  refreshSettings: async () => {
    set({ settings: await getApi().getSettings() });
  },
  refreshProfiles: async () => {
    set({ profiles: await getApi().getProfiles() });
  },
  pushLog: (line) => {
    const stamped = {
      ...line,
      time: line.time || new Date().toISOString(),
      type: line.type || "info",
      payload: line.payload ?? "",
    };
    // split multi-line payloads so each row is one log line
    const parts = String(stamped.payload)
      .split(/\r?\n/)
      .map((s) => s.trimEnd())
      .filter((s) => s.length > 0);
    if (parts.length <= 1) {
      const logs = [...get().logs, stamped].slice(-500);
      set({ logs });
      return;
    }
    const extras = parts.map((payload) => ({
      ...stamped,
      payload,
      time: new Date().toISOString(),
    }));
    const logs = [...get().logs, ...extras].slice(-500);
    set({ logs });
  },
  clearLogs: () => set({ logs: [] }),
  setTraffic: (traffic) => set({ traffic }),
  setCore: (core) => set({ core }),
  setSettings: (settings) => {
    applyUiChrome({
      accentColor: settings.accentColor,
      textScale: settings.textScale,
    });
    set({ settings });
  },
  setProfiles: (profiles) => set({ profiles }),
}));

export function useAppBootstrap() {
  const init = useAppStore((s) => s.init);
  const setCore = useAppStore((s) => s.setCore);
  const setSettings = useAppStore((s) => s.setSettings);
  const pushLog = useAppStore((s) => s.pushLog);
  const setTraffic = useAppStore((s) => s.setTraffic);
  const ready = useAppStore((s) => s.ready);
  const bridgeOk = hasApi();

  useEffect(() => {
    if (!hasApi()) return;
    void init();
    const api = getApi();
    const off1 = api.onCoreState(setCore);
    const off2 = api.onSettingsChanged(setSettings);
    const off3 = api.onCoreLog(pushLog);
    const off4 = api.onTraffic(setTraffic);
    return () => {
      off1();
      off2();
      off3();
      off4();
    };
  }, [init, setCore, setSettings, pushLog, setTraffic]);

  // Traffic is pushed from the main process over IPC (WS with Authorization).
  // Renderer no longer opens a direct WebSocket to avoid secret/header issues.
  void setTraffic;

  return { ready, bridgeOk };
}
