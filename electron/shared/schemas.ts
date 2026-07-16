import { z } from "zod";

/** Runtime validation for settings.json (partial — normalizers fill defaults). */
export const settingsFileSchema = z
  .object({
    settingsVersion: z.number().optional(),
    mixedPort: z.number().optional(),
    allowLan: z.boolean().optional(),
    mode: z.enum(["rule", "global", "direct"]).optional(),
    logLevel: z
      .enum(["silent", "error", "warning", "info", "debug"])
      .optional(),
    systemProxy: z.boolean().optional(),
    tun: z.boolean().optional(),
    ipv6: z.boolean().optional(),
    testUrl: z.string().optional(),
    autoUpdateHours: z.number().optional(),
    externalController: z.string().optional(),
    startOnLaunch: z.boolean().optional(),
    autoStartCore: z.boolean().optional(),
    minimizeToTray: z.boolean().optional(),
    showTrayTitle: z.boolean().optional(),
    bypassDomains: z.array(z.string()).optional(),
    dns: z.record(z.string(), z.unknown()).optional(),
    hotkeys: z.record(z.string(), z.unknown()).optional(),
    webdav: z.record(z.string(), z.unknown()).optional(),
    accentColor: z.string().optional(),
    textScale: z.number().optional(),
    checkUpdateOnLaunch: z.boolean().optional(),
    ports: z.record(z.string(), z.unknown()).optional(),
    onDemand: z.record(z.string(), z.unknown()).optional(),
    dashboard: z.record(z.string(), z.unknown()).optional(),
    themePreset: z.string().optional(),
    hosts: z.record(z.string(), z.string()).optional(),
    geoxUrl: z.record(z.string(), z.unknown()).optional(),
    keepAliveInterval: z.number().optional(),
    geodataLoader: z.string().optional(),
    globalUa: z.string().optional(),
    unifiedDelay: z.boolean().optional(),
    tcpConcurrent: z.boolean().optional(),
    findProcessMode: z.string().optional(),
    globalPrependRules: z.array(z.string()).optional(),
    proxiesUi: z.record(z.string(), z.unknown()).optional(),
    systemDns: z.record(z.string(), z.unknown()).optional(),
    developerMode: z.boolean().optional(),
  })
  .passthrough();

export const profilesFileSchema = z
  .object({
    profilesVersion: z.number().optional(),
    currentId: z.string().nullable().optional(),
    items: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
