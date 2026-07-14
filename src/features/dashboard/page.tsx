import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCopy,
  Power,
  RefreshCw,
  Shield,
} from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import { MetricCard } from "@/shared/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { formatBytes, formatSpeed } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { ProxyMode } from "@/entities/mihomo/types";

export function DashboardPage() {
  const core = useAppStore((s) => s.core);
  const settings = useAppStore((s) => s.settings);
  const traffic = useAppStore((s) => s.traffic);
  const profiles = useAppStore((s) => s.profiles);
  const setCore = useAppStore((s) => s.setCore);
  const setSettings = useAppStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ up: number; down: number }[]>([]);
  const { t } = useI18n();

  const running = core?.status === "running";
  const currentProfile = profiles?.items.find(
    (p) => p.id === profiles.currentId,
  );

  useEffect(() => {
    setHistory((h) => {
      const next = [...h, { up: traffic.up, down: traffic.down }];
      return next.slice(-40);
    });
  }, [traffic.up, traffic.down]);

  async function toggleCore() {
    setBusy(true);
    try {
      const api = getApi();
      const state = running ? await api.stopCore() : await api.startCore();
      setCore(state);
      toast.success(running ? t.dashboard.stopped : t.dashboard.started);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setBusy(true);
    try {
      setCore(await getApi().restartCore());
      toast.success(t.dashboard.restarted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: ProxyMode) {
    try {
      await getApi().setMode(mode);
      setSettings(await getApi().getSettings());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleSystemProxy(enabled: boolean) {
    try {
      setSettings(await getApi().setSystemProxy(enabled));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleTun(enabled: boolean) {
    try {
      setSettings(await getApi().updateSettings({ tun: enabled }));
      toast.success(enabled ? t.dashboard.tunOn : t.dashboard.tunOff);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function copyEnv() {
    try {
      await getApi().copyProxyEnv();
      toast.success(t.dashboard.envCopied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const maxHist = Math.max(1, ...history.map((h) => h.up + h.down));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.dashboard.title}
        description={
          currentProfile
            ? `${t.dashboard.profilePrefix} ${currentProfile.name}`
            : t.dashboard.importHint
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void copyEnv()}
            >
              <ClipboardCopy className="size-3.5" strokeWidth={1.8} />
              {t.dashboard.copyEnv}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              disabled={!running || busy}
              onClick={() => void restart()}
            >
              <RefreshCw className="size-3.5" strokeWidth={1.8} />
              {t.dashboard.restart}
            </Button>
            <Button
              size="sm"
              variant={running ? "destructive" : "default"}
              disabled={busy || core?.status === "starting"}
              onClick={() => void toggleCore()}
            >
              <Power className="size-3.5" strokeWidth={1.8} />
              {running ? t.dashboard.stop : t.dashboard.start}
            </Button>
          </>
        }
      />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t.dashboard.status}
          value={
            <span className="flex items-center gap-2">
              <span
                className={
                  running
                    ? "size-2 rounded-full bg-success"
                    : "size-2 rounded-full bg-muted-foreground/40"
                }
              />
              {core?.status ?? "—"}
            </span>
          }
          hint={core?.version ? `mihomo ${core.version}` : undefined}
        />
        <MetricCard
          label={t.dashboard.upload}
          value={
            <span className="flex items-center gap-2">
              <ArrowUpFromLine
                className="size-4 text-muted-foreground"
                strokeWidth={1.8}
              />
              {formatSpeed(traffic.up)}
            </span>
          }
          hint={
            traffic.upTotal != null
              ? `${t.dashboard.total} ${formatBytes(traffic.upTotal)}`
              : undefined
          }
        />
        <MetricCard
          label={t.dashboard.download}
          value={
            <span className="flex items-center gap-2">
              <ArrowDownToLine
                className="size-4 text-muted-foreground"
                strokeWidth={1.8}
              />
              {formatSpeed(traffic.down)}
            </span>
          }
          hint={
            traffic.downTotal != null
              ? `${t.dashboard.total} ${formatBytes(traffic.downTotal)}`
              : undefined
          }
        />
        <MetricCard
          label={t.dashboard.mixedPort}
          value={
            <span className="tabular-nums">{settings?.mixedPort ?? 7890}</span>
          }
          hint={settings?.externalController}
        />
      </section>

      <section className="grid gap-2 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t.dashboard.outboundMode}</h2>
            <Badge variant="secondary">{settings?.mode ?? "rule"}</Badge>
          </div>
          <Tabs
            value={settings?.mode ?? "rule"}
            onValueChange={(v) => void setMode(v as ProxyMode)}
          >
            <TabsList>
              <TabsTrigger value="rule">Rule</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
              <TabsTrigger value="direct">Direct</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t.dashboard.modeLive}
          </p>
        </Card>

        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-medium">{t.dashboard.network}</h2>
          <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-foreground">
                {t.dashboard.systemProxy}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t.dashboard.systemProxyHint}:{settings?.mixedPort ?? 7890}
              </p>
            </div>
            <Switch
              checked={!!settings?.systemProxy}
              onCheckedChange={(v) => void toggleSystemProxy(v)}
              aria-label={t.dashboard.systemProxy}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-foreground">
                <Shield className="size-3.5" strokeWidth={1.8} />
                {t.dashboard.tun}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t.dashboard.tunHint}
              </p>
            </div>
            <Switch
              checked={!!settings?.tun}
              onCheckedChange={(v) => void toggleTun(v)}
              aria-label={t.dashboard.tun}
            />
          </div>
        </Card>
      </section>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">{t.dashboard.trafficHistory}</h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            ↑ {formatSpeed(traffic.up)} · ↓ {formatSpeed(traffic.down)}
          </span>
        </div>
        <div className="flex h-24 items-end gap-px">
          {history.length
            ? history.map((h, i) => {
                const total = h.up + h.down;
                const pct = Math.max(4, Math.round((total / maxHist) * 100));
                const upPct =
                  total > 0 ? Math.round((h.up / total) * pct) : 0;
                return (
                  <div
                    key={i}
                    className="flex min-w-0 flex-1 flex-col justify-end gap-px"
                    style={{ height: "100%" }}
                    title={`↑ ${formatSpeed(h.up)} ↓ ${formatSpeed(h.down)}`}
                  >
                    <div
                      className="w-full rounded-sm bg-foreground/70"
                      style={{ height: `${upPct}%` }}
                    />
                    <div
                      className="w-full rounded-sm bg-foreground/25"
                      style={{ height: `${Math.max(0, pct - upPct)}%` }}
                    />
                  </div>
                );
              })
            : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                —
              </div>
            )}
        </div>
      </Card>

      {core?.error ? (
        <Card className="p-4 text-xs text-destructive">{core.error}</Card>
      ) : null}
    </div>
  );
}
