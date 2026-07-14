import { useEffect } from "react";
import { create } from "zustand";
import { getApi, hasApi } from "@/shared/lib/api";
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
    set({ core, settings, profiles, ready: true });
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
    const logs = [...get().logs, line].slice(-500);
    set({ logs });
  },
  setTraffic: (traffic) => set({ traffic }),
  setCore: (core) => set({ core }),
  setSettings: (settings) => set({ settings }),
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
