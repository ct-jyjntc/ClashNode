import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  FolderOpen,
  RotateCcw,
  Save,
  Shield,
} from "lucide-react";
import { useTheme } from "next-themes";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { useI18n, type Locale } from "@/shared/i18n";
import type {
  AppSettings,
  DnsEnhancedMode,
  LogLevel,
  ProxyMode,
} from "@/entities/mihomo/types";

const DEFAULT_BYPASS = [
  "127.0.0.1",
  "192.168.0.0/16",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "localhost",
  "*.local",
  "timestamp.apple.com",
  "sequoia.apple.com",
  "seed-sequoia.siri.apple.com",
];

type AppPaths = {
  home: string;
  config: string;
  profiles: string;
  settings: string;
  mihomo: string;
};

type AppVersion = {
  app: string;
  electron: string;
  node: string;
  chrome: string;
  platform: string;
  arch: string;
};

function parseList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatList(list: string[] | undefined): string {
  return (list ?? []).join("\n");
}

function SwitchRow({
  title,
  desc,
  checked,
  onCheckedChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}

function ListArea({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 5,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-input bg-secondary/55 p-3 font-mono text-[11px] leading-5 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const core = useAppStore((s) => s.core);
  const setSettings = useAppStore((s) => s.setSettings);
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [configText, setConfigText] = useState("");
  const [saving, setSaving] = useState(false);
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [version, setVersion] = useState<AppVersion | null>(null);
  const [secret, setSecret] = useState("");
  const [bypassText, setBypassText] = useState("");
  const [defaultNsText, setDefaultNsText] = useState("");
  const [nameserverText, setNameserverText] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!settings) return;
    setDraft(settings);
    setBypassText(formatList(settings.bypassDomains));
    setDefaultNsText(formatList(settings.dns?.defaultNameserver));
    setNameserverText(formatList(settings.dns?.nameserver));
    setFallbackText(formatList(settings.dns?.fallback));
  }, [settings]);

  useEffect(() => {
    void (async () => {
      try {
        const api = getApi();
        const [cfg, p, v, cred] = await Promise.all([
          api.getRuntimeConfig(),
          api.getAppPaths(),
          api.getAppVersion(),
          api.getApiCredentials(),
        ]);
        setConfigText(cfg);
        setPaths(p);
        setVersion(v);
        setSecret(cred.secret);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  if (!draft) return null;

  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function patchDns<K extends keyof AppSettings["dns"]>(
    key: K,
    value: AppSettings["dns"][K],
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            dns: { ...d.dns, [key]: value },
          }
        : d,
    );
  }

  function patchHotkey(key: keyof AppSettings["hotkeys"], value: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            hotkeys: { ...d.hotkeys, [key]: value },
          }
        : d,
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const payload: AppSettings = {
        ...draft,
        bypassDomains: parseList(bypassText),
        dns: {
          ...draft.dns,
          defaultNameserver: parseList(defaultNsText),
          nameserver: parseList(nameserverText),
          fallback: parseList(fallbackText),
        },
        hotkeys: {
          toggleCore: draft.hotkeys.toggleCore.trim(),
          toggleSystemProxy: draft.hotkeys.toggleSystemProxy.trim(),
          toggleTun: draft.hotkeys.toggleTun.trim(),
          showWindow: draft.hotkeys.showWindow.trim(),
        },
      };
      setSettings(await getApi().updateSettings(payload));
      toast.success(t.settings.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    try {
      await getApi().saveRuntimeConfig(configText);
      toast.success(t.settings.yamlApplied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function backup() {
    try {
      const path = await getApi().createBackup();
      if (path) toast.success(`${t.settings.backupSaved}: ${path}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function restore() {
    try {
      const ok = await getApi().restoreBackup();
      if (ok) {
        setSettings(await getApi().getSettings());
        toast.success(t.settings.backupRestored);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function copy(text: string) {
    try {
      await getApi().copyText(text);
      toast.success(t.settings.copied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function openWhich(which: string) {
    try {
      await getApi().openPath(which);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function revealWhich(which: string) {
    try {
      await getApi().showItemInFolder(which);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function authorizeTun() {
    try {
      const res = await getApi().authorizeTun();
      if (res.ok) toast.success(t.settings.authorizeTunOk);
      else toast.error(res.message || t.settings.authorizeTunFail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const endpoint = `http://${draft.externalController}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.settings.title}
        description={t.settings.desc}
        actions={
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            <Save className="size-3.5" strokeWidth={1.8} />
            {saving ? t.settings.saving : t.settings.save}
          </Button>
        }
      />

      <section className="grid gap-2 lg:grid-cols-2">
        <Card className="space-y-4 p-4 sm:p-5">
          <h2 className="text-sm font-medium">{t.settings.general}</h2>
          <div className="space-y-2">
            <Label>{t.settings.language}</Label>
            <Tabs value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <TabsList>
                <TabsTrigger value="zh-CN">中文</TabsTrigger>
                <TabsTrigger value="en">English</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground">
              {t.settings.languageHint}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t.settings.theme}</Label>
            <Tabs value={theme ?? "system"} onValueChange={(v) => setTheme(v)}>
              <TabsList>
                <TabsTrigger value="system">{t.settings.themeSystem}</TabsTrigger>
                <TabsTrigger value="light">{t.settings.themeLight}</TabsTrigger>
                <TabsTrigger value="dark">{t.settings.themeDark}</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground">
              {t.settings.themeHint}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t.settings.mode}</Label>
            <Tabs
              value={draft.mode}
              onValueChange={(v) => patch("mode", v as ProxyMode)}
            >
              <TabsList>
                <TabsTrigger value="rule">Rule</TabsTrigger>
                <TabsTrigger value="global">Global</TabsTrigger>
                <TabsTrigger value="direct">Direct</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-2">
            <Label>{t.settings.logLevel}</Label>
            <Tabs
              value={draft.logLevel}
              onValueChange={(v) => patch("logLevel", v as LogLevel)}
            >
              <TabsList>
                {(["silent", "error", "warning", "info", "debug"] as const).map(
                  (lv) => (
                    <TabsTrigger key={lv} value={lv}>
                      {lv}
                    </TabsTrigger>
                  ),
                )}
              </TabsList>
            </Tabs>
          </div>
        </Card>

        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-medium">{t.settings.proxy}</h2>
          <div className="space-y-2">
            <Label htmlFor="mixedPort">{t.settings.mixedPort}</Label>
            <Input
              id="mixedPort"
              type="number"
              value={draft.mixedPort}
              onChange={(e) => patch("mixedPort", Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="controller">{t.settings.controller}</Label>
            <Input
              id="controller"
              value={draft.externalController}
              onChange={(e) => patch("externalController", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="testUrl">{t.settings.testUrl}</Label>
            <Input
              id="testUrl"
              value={draft.testUrl}
              onChange={(e) => patch("testUrl", e.target.value)}
            />
          </div>
          <SwitchRow
            title={t.settings.allowLan}
            desc={t.settings.allowLanHint}
            checked={!!draft.allowLan}
            onCheckedChange={(v) => patch("allowLan", v)}
          />
          <SwitchRow
            title={t.settings.systemProxy}
            desc={t.settings.systemProxyHint}
            checked={!!draft.systemProxy}
            onCheckedChange={(v) => patch("systemProxy", v)}
          />
          <SwitchRow
            title={t.settings.tun}
            desc={t.settings.tunHint}
            checked={!!draft.tun}
            onCheckedChange={(v) => patch("tun", v)}
          />
          <SwitchRow
            title={t.settings.ipv6}
            desc={t.settings.ipv6Hint}
            checked={!!draft.ipv6}
            onCheckedChange={(v) => patch("ipv6", v)}
          />
        </Card>
      </section>

      <section className="grid gap-2 lg:grid-cols-2">
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t.settings.bypass}</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setBypassText(DEFAULT_BYPASS.join("\n"))}
            >
              <RotateCcw className="size-3.5" strokeWidth={1.8} />
              {t.settings.bypassReset}
            </Button>
          </div>
          <ListArea
            id="bypass"
            label={t.settings.bypass}
            hint={t.settings.bypassHint}
            value={bypassText}
            onChange={setBypassText}
            rows={8}
          />
        </Card>

        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-medium">{t.settings.behavior}</h2>
          <SwitchRow
            title={t.settings.startOnLaunch}
            desc={t.settings.startOnLaunchHint}
            checked={!!draft.startOnLaunch}
            onCheckedChange={(v) => patch("startOnLaunch", v)}
          />
          <SwitchRow
            title={t.settings.autoStartCore}
            desc={t.settings.autoStartCoreHint}
            checked={!!draft.autoStartCore}
            onCheckedChange={(v) => patch("autoStartCore", v)}
          />
          <SwitchRow
            title={t.settings.minimizeToTray}
            desc={t.settings.minimizeToTrayHint}
            checked={!!draft.minimizeToTray}
            onCheckedChange={(v) => patch("minimizeToTray", v)}
          />
          <div className="space-y-2">
            <Label htmlFor="autoUpdate">{t.settings.autoUpdateHours}</Label>
            <Input
              id="autoUpdate"
              type="number"
              min={0}
              value={draft.autoUpdateHours}
              onChange={(e) =>
                patch(
                  "autoUpdateHours",
                  Math.max(0, Number(e.target.value) || 0),
                )
              }
            />
            <p className="text-[11px] text-muted-foreground">
              {t.settings.autoUpdateHoursHint}
            </p>
          </div>
        </Card>
      </section>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-medium">{t.settings.dns}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <SwitchRow
            title={t.settings.dnsEnable}
            desc={t.settings.dnsEnableHint}
            checked={!!draft.dns.enable}
            onCheckedChange={(v) => patchDns("enable", v)}
          />
          <SwitchRow
            title={t.settings.dnsOverride}
            desc={t.settings.dnsOverrideHint}
            checked={!!draft.dns.overrideProfile}
            onCheckedChange={(v) => patchDns("overrideProfile", v)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t.settings.dnsMode}</Label>
          <Tabs
            value={draft.dns.enhancedMode}
            onValueChange={(v) =>
              patchDns("enhancedMode", v as DnsEnhancedMode)
            }
          >
            <TabsList>
              <TabsTrigger value="fake-ip">fake-ip</TabsTrigger>
              <TabsTrigger value="redir-host">redir-host</TabsTrigger>
              <TabsTrigger value="normal">normal</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fakeIp">{t.settings.dnsFakeIpRange}</Label>
          <Input
            id="fakeIp"
            value={draft.dns.fakeIpRange}
            onChange={(e) => patchDns("fakeIpRange", e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <ListArea
            id="defaultNs"
            label={t.settings.dnsDefaultNs}
            hint={t.settings.dnsListHint}
            value={defaultNsText}
            onChange={setDefaultNsText}
            rows={4}
          />
          <ListArea
            id="nameserver"
            label={t.settings.dnsNameserver}
            hint={t.settings.dnsListHint}
            value={nameserverText}
            onChange={setNameserverText}
            rows={4}
          />
          <ListArea
            id="fallback"
            label={t.settings.dnsFallback}
            hint={t.settings.dnsListHint}
            value={fallbackText}
            onChange={setFallbackText}
            rows={4}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-medium">{t.settings.hotkeys}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t.settings.hotkeysHint}
          </p>
        </div>
        {(
          [
            ["toggleCore", t.settings.hotkeyToggleCore],
            ["toggleSystemProxy", t.settings.hotkeyToggleProxy],
            ["toggleTun", t.settings.hotkeyToggleTun],
            ["showWindow", t.settings.hotkeyShowWindow],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`hk-${key}`}>{label}</Label>
            <div className="flex gap-2">
              <Input
                id={`hk-${key}`}
                value={draft.hotkeys[key]}
                onChange={(e) => patchHotkey(key, e.target.value)}
                placeholder="CommandOrControl+Shift+…"
                className="font-mono text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0 text-muted-foreground"
                onClick={() => patchHotkey(key, "")}
              >
                {t.settings.hotkeyClear}
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <section className="grid gap-2 lg:grid-cols-2">
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-medium">{t.settings.advanced}</h2>
          <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs">
                <Shield className="size-3.5" strokeWidth={1.8} />
                {t.settings.authorizeTun}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t.settings.authorizeTunHint}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => void authorizeTun()}
            >
              Auth
            </Button>
          </div>
          <div className="space-y-2">
            <Label>{t.settings.apiEndpoint}</Label>
            <div className="flex gap-2">
              <Input readOnly value={endpoint} className="font-mono" />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0 text-muted-foreground"
                onClick={() => void copy(endpoint)}
              >
                <Copy className="size-3.5" strokeWidth={1.8} />
                {t.settings.copy}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.settings.apiSecret}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={secret || "—"}
                className="font-mono text-[11px]"
              />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0 text-muted-foreground"
                disabled={!secret}
                onClick={() => void copy(secret)}
              >
                <Copy className="size-3.5" strokeWidth={1.8} />
                {t.settings.copy}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.settings.paths}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void openWhich("home")}
              >
                <FolderOpen className="size-3.5" strokeWidth={1.8} />
                {t.settings.openHome}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void revealWhich("config")}
              >
                <ExternalLink className="size-3.5" strokeWidth={1.8} />
                {t.settings.openConfig}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void openWhich("profiles")}
              >
                <FolderOpen className="size-3.5" strokeWidth={1.8} />
                {t.settings.openProfiles}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void revealWhich("mihomo")}
              >
                <ExternalLink className="size-3.5" strokeWidth={1.8} />
                {t.settings.revealMihomo}
              </Button>
            </div>
            {paths ? (
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {paths.home}
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t.settings.backup}</h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void backup()}
              >
                <Archive className="size-3.5" strokeWidth={1.8} />
                {t.settings.exportZip}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void restore()}
              >
                <ArchiveRestore className="size-3.5" strokeWidth={1.8} />
                {t.settings.restore}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t.settings.backupHint}
          </p>
          <div className="pt-2">
            <h3 className="mb-2 text-sm font-medium">{t.settings.about}</h3>
            <div className="grid gap-1 font-mono text-[11px] text-muted-foreground sm:grid-cols-2">
              <p>ClashNode {version?.app ?? "0.1.0"}</p>
              <p>mihomo {core?.version ?? "—"}</p>
              <p>Electron {version?.electron ?? "—"}</p>
              <p>
                {version?.platform ?? "—"}/{version?.arch ?? "—"} · Node{" "}
                {version?.node ?? "—"}
              </p>
            </div>
          </div>
        </Card>
      </section>

      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">{t.settings.runtimeYaml}</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t.settings.runtimeYamlHint}
            </p>
          </div>
          <Button size="sm" onClick={() => void saveConfig()}>
            {t.settings.applyYaml}
          </Button>
        </div>
        <textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          spellCheck={false}
          className="h-72 w-full resize-y rounded-md border border-input bg-secondary/55 p-3 font-mono text-[11px] leading-5 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </Card>
    </div>
  );
}
