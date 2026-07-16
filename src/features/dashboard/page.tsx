import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCopy,
  Power,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import type { DashboardWidgetId, ProxyMode } from "@/entities/mihomo/types";

const DEFAULT_WIDGETS: DashboardWidgetId[] = [
  "status",
  "upload",
  "download",
  "port",
  "mode",
  "network",
  "traffic",
  "memory",
  "publicIp",
  "networkCheck",
];

export function DashboardPage() {
  const core = useAppStore((s) => s.core);
  const settings = useAppStore((s) => s.settings);
  const traffic = useAppStore((s) => s.traffic);
  const profiles = useAppStore((s) => s.profiles);
  const setCore = useAppStore((s) => s.setCore);
  const setSettings = useAppStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<
    { t: number; up: number; down: number }[]
  >([]);
  const [memory, setMemory] = useState<number | null>(null);
  const [publicIp, setPublicIp] = useState<string>("—");
  const [netCheck, setNetCheck] = useState<{
    ok?: boolean;
    ms?: number;
    error?: string;
  }>({});
  const { t } = useI18n();

  const running = core?.status === "running";
  const currentProfile = profiles?.items.find(
    (p) => p.id === profiles.currentId,
  );

  const widgets = settings?.dashboard?.widgets?.length
    ? settings.dashboard.widgets
    : DEFAULT_WIDGETS;
  const show = (id: DashboardWidgetId) => widgets.includes(id);

  useEffect(() => {
    setHistory((h) => {
      const next = [
        ...h,
        { t: Date.now(), up: traffic.up, down: traffic.down },
      ];
      return next.slice(-60);
    });
  }, [traffic.up, traffic.down]);

  useEffect(() => {
    if (!running) {
      setMemory(null);
      return;
    }
    let cancelled = false;
    async function tick() {
      try {
        const snap = await getApi().getConnections();
        if (!cancelled) setMemory(snap.memory ?? null);
      } catch {
        /* ignore */
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [running]);

  useEffect(() => {
    let cancelled = false;
    async function loadIp() {
      try {
        const res = await getApi().getPublicIp();
        if (!cancelled) setPublicIp(res.ok ? res.ip : "—");
      } catch {
        if (!cancelled) setPublicIp("—");
      }
    }
    void loadIp();
    return () => {
      cancelled = true;
    };
  }, [running]);

  const chartData = useMemo(
    () =>
      history.map((h, i) => ({
        i,
        up: h.up,
        down: h.down,
        label: new Date(h.t).toLocaleTimeString(),
      })),
    [history],
  );

  async function toggleCore() {
    if (!core) return;
    setBusy(true);
    // Optimistic: flip status immediately (main also pushes core:state)
    const wasRunning = running;
    setCore({
      ...core,
      status: wasRunning ? "stopping" : "starting",
    });
    try {
      const api = getApi();
      const state = wasRunning ? await api.stopCore() : await api.startCore();
      setCore(state);
      toast.success(wasRunning ? t.dashboard.stopped : t.dashboard.started);
    } catch (e) {
      try {
        setCore(await getApi().getCoreState());
      } catch {
        /* ignore */
      }
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    if (!core) return;
    setBusy(true);
    setCore({ ...core, status: "starting" });
    try {
      setCore(await getApi().restartCore());
      toast.success(t.dashboard.restarted);
    } catch (e) {
      try {
        setCore(await getApi().getCoreState());
      } catch {
        /* ignore */
      }
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: ProxyMode) {
    if (settings) setSettings({ ...settings, mode });
    try {
      await getApi().setMode(mode);
      setSettings(await getApi().getSettings());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleSystemProxy(enabled: boolean) {
    // Optimistic UI — IPC returns after settings write; networksetup is async
    if (settings) setSettings({ ...settings, systemProxy: enabled });
    try {
      setSettings(await getApi().setSystemProxy(enabled));
    } catch (e) {
      if (settings) setSettings({ ...settings, systemProxy: !enabled });
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleTun(enabled: boolean) {
    if (settings) setSettings({ ...settings, tun: enabled });
    try {
      setSettings(await getApi().updateSettings({ tun: enabled }));
      toast.success(enabled ? t.dashboard.tunOn : t.dashboard.tunOff);
    } catch (e) {
      if (settings) setSettings({ ...settings, tun: !enabled });
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

  const metricCount = [
    show("status"),
    show("upload"),
    show("download"),
    show("port"),
  ].filter(Boolean).length;

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

      {metricCount > 0 ? (
        <section
          className={
            metricCount >= 4
              ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
              : metricCount === 3
                ? "grid gap-2 sm:grid-cols-3"
                : metricCount === 2
                  ? "grid gap-2 sm:grid-cols-2"
                  : "grid gap-2"
          }
        >
          {show("status") ? (
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
          ) : null}
          {show("upload") ? (
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
          ) : null}
          {show("download") ? (
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
          ) : null}
          {show("port") ? (
            <MetricCard
              label={t.dashboard.mixedPort}
              value={
                <span className="tabular-nums">
                  {settings?.mixedPort ?? 7890}
                </span>
              }
              hint={settings?.externalController}
            />
          ) : null}
        </section>
      ) : null}

      {show("mode") || show("network") ? (
        <section
          className={
            show("mode") && show("network")
              ? "grid gap-2 lg:grid-cols-2"
              : "grid gap-2"
          }
        >
          {show("mode") ? (
            <Card className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium">
                  {t.dashboard.outboundMode}
                </h2>
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
          ) : null}

          {show("network") ? (
            <Card className="space-y-3 p-4 sm:p-5">
              <h2 className="text-sm font-medium">{t.dashboard.network}</h2>
              <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">
                    {t.dashboard.systemProxy}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.dashboard.systemProxyHint}:
                    {settings?.mixedPort ?? 7890}
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
          ) : null}
        </section>
      ) : null}

      {show("memory") || show("publicIp") || show("networkCheck") ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {show("memory") ? (
            <MetricCard
              label={t.dashboard.memory}
              value={
                memory != null && memory > 0
                  ? formatBytes(memory)
                  : running
                    ? "…"
                    : "—"
              }
              hint={t.dashboard.memoryHint}
            />
          ) : null}
          {show("publicIp") ? (
            <MetricCard
              label={t.dashboard.publicIp}
              value={publicIp}
              hint={t.dashboard.publicIpHint}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    void (async () => {
                      try {
                        const res = await getApi().getPublicIp();
                        setPublicIp(res.ok ? res.ip : "—");
                      } catch {
                        setPublicIp("—");
                      }
                    })();
                  }}
                >
                  {t.common.refresh}
                </Button>
              }
            />
          ) : null}
          {show("networkCheck") ? (
            <MetricCard
              label={t.dashboard.networkCheck}
              value={
                netCheck.ms != null
                  ? `${netCheck.ok ? "OK" : "FAIL"} · ${netCheck.ms}ms`
                  : "—"
              }
              hint={netCheck.error || t.dashboard.networkCheckHint}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    void (async () => {
                      try {
                        const res = await getApi().networkCheck();
                        setNetCheck(res);
                      } catch (e) {
                        setNetCheck({
                          ok: false,
                          error: e instanceof Error ? e.message : String(e),
                        });
                      }
                    })();
                  }}
                >
                  {t.dashboard.runCheck}
                </Button>
              }
            />
          ) : null}
        </section>
      ) : null}

      {show("traffic") ? (
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t.dashboard.trafficHistory}</h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              ↑ {formatSpeed(traffic.up)} · ↓ {formatSpeed(traffic.down)}
            </span>
          </div>
          <div className="h-40 w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                    <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="currentColor"
                    strokeOpacity={0.06}
                    vertical={false}
                  />
                  <XAxis dataKey="i" hide />
                  <YAxis
                    width={40}
                    tick={{ fontSize: 10, fill: "currentColor", opacity: 0.45 }}
                    tickFormatter={(v: number) => formatSpeed(Number(v))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(value: number | string, name: string) => [
                      formatSpeed(Number(value)),
                      name === "up" ? "↑" : "↓",
                    ]}
                    labelFormatter={(
                      _label: unknown,
                      payload?: Array<{ payload?: { label?: string } }>,
                    ) => payload?.[0]?.payload?.label ?? ""}
                  />
                  <Area
                    type="monotone"
                    dataKey="up"
                    stroke="currentColor"
                    strokeOpacity={0.85}
                    fill="url(#upFill)"
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="down"
                    stroke="currentColor"
                    strokeOpacity={0.4}
                    fill="url(#downFill)"
                    strokeWidth={1.25}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                {t.dashboard.chartEmpty}
              </div>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
