import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, RefreshCw, Timer } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import {
  ListPage,
  ListPanelPlaceholder,
  tableHeadClass,
  tableRowClass,
  type TableDensity,
} from "@/shared/components/list-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { cn, formatBytes, formatDate, formatDelay } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { ProviderInfo, ProxyNode } from "@/entities/mihomo/types";

const GROUP_TYPES = new Set([
  "Selector",
  "URLTest",
  "Fallback",
  "LoadBalance",
  "Relay",
]);

export function ProxiesPage() {
  const core = useAppStore((s) => s.core);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const { t } = useI18n();
  const [tab, setTab] = useState<"nodes" | "providers">("nodes");
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({});
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [query, setQuery] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [providerBusy, setProviderBusy] = useState<string | null>(null);

  const running = core?.status === "running";
  const sortMode = settings?.proxiesUi?.sort ?? "default";
  const sortAsc = settings?.proxiesUi?.sortAsc !== false;
  const density: TableDensity =
    settings?.proxiesUi?.density === "compact" ? "compact" : "comfortable";
  const headClass = tableHeadClass(density);
  const rowClass = tableRowClass(density);

  async function patchProxiesUi(
    patch: Partial<{ sort: "default" | "name" | "delay" | "type"; sortAsc: boolean; density: "comfortable" | "compact" }>,
  ) {
    try {
      const next = await getApi().updateSettings({
        proxiesUi: {
          sort: patch.sort ?? sortMode,
          sortAsc: patch.sortAsc ?? sortAsc,
          density: patch.density ?? density,
        },
      });
      setSettings(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const load = useCallback(async () => {
    if (!running) {
      setProxies({});
      setProviders({});
      return;
    }
    setLoading(true);
    try {
      const [px, pv] = await Promise.all([
        getApi().getProxies(),
        getApi().getProviders(),
      ]);
      setProxies(px.proxies || {});
      setProviders(pv.providers || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [running]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerList = useMemo(() => {
    const items = Object.values(providers).filter(
      (p) => p.vehicleType !== "Compatible",
    );
    const q = providerQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [providers, providerQuery]);

  const groups = useMemo(() => {
    return Object.values(proxies)
      .filter((p) => GROUP_TYPES.has(p.type) && !p.hidden)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [proxies]);

  useEffect(() => {
    if (!activeGroup && groups[0]) setActiveGroup(groups[0].name);
  }, [groups, activeGroup]);

  const group = proxies[activeGroup];
  const members = useMemo(() => {
    if (!group?.all) return [];
    const q = query.trim().toLowerCase();
    const list = group.all
      .map((name) => proxies[name] || { name, type: "Unknown" })
      .filter((n) => !q || n.name.toLowerCase().includes(q));

    const delayOf = (n: ProxyNode) => {
      if (delays[n.name] != null) return delays[n.name];
      const hist = n.history;
      if (hist?.length) return hist[hist.length - 1]?.delay ?? 0;
      return 0;
    };

    if (sortMode === "default") return list;
    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortMode === "name") cmp = a.name.localeCompare(b.name);
      else if (sortMode === "type") cmp = (a.type || "").localeCompare(b.type || "");
      else if (sortMode === "delay") {
        const da = delayOf(a) || 999999;
        const db = delayOf(b) || 999999;
        cmp = da - db;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [group, proxies, query, sortMode, sortAsc, delays]);

  async function select(name: string) {
    if (!group) return;
    try {
      await getApi().selectProxy(group.name, name);
      await load();
      toast.success(`${t.proxies.selected} ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function testAll() {
    if (!group?.all?.length) return;
    setTesting(true);
    const next: Record<string, number> = { ...delays };
    const queue = [...group.all];
    const concurrency = 6;
    async function worker() {
      while (queue.length) {
        const name = queue.shift()!;
        try {
          const r = await getApi().testDelay(name);
          next[name] = r.delay;
          setDelays({ ...next });
        } catch {
          next[name] = 0;
          setDelays({ ...next });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, group.all.length) }, () =>
        worker(),
      ),
    );
    setTesting(false);
  }

  if (!running) {
    return (
      <ListPage>
        <PageHeader title={t.proxies.title} description={t.proxies.needCore} />
        <ListPanelPlaceholder>{t.proxies.coreOff}</ListPanelPlaceholder>
      </ListPage>
    );
  }

  async function refreshProvider(name: string) {
    setProviderBusy(name);
    try {
      await getApi().updateProvider(name);
      await load();
      toast.success(t.providers.refreshed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setProviderBusy(null);
    }
  }

  async function healthProvider(name: string) {
    setProviderBusy(`h:${name}`);
    try {
      await getApi().healthcheckProvider(name);
      await load();
      toast.success(t.providers.healthDone);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setProviderBusy(null);
    }
  }

  return (
    <ListPage>
      <PageHeader
        title={t.proxies.title}
        description={
          tab === "nodes"
            ? `${groups.length} ${t.proxies.groups}`
            : `${providerList.length} ${t.providers.count}`
        }
        actions={
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="nodes">{t.proxies.tabNodes}</TabsTrigger>
                <TabsTrigger value="providers">
                  {t.proxies.tabProviders}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="size-3.5" strokeWidth={1.8} />
              {t.proxies.refresh}
            </Button>
            {tab === "nodes" ? (
              <>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={sortMode}
                  onChange={(e) =>
                    void patchProxiesUi({
                      sort: e.target.value as
                        | "default"
                        | "name"
                        | "delay"
                        | "type",
                    })
                  }
                  aria-label={t.proxies.sort}
                >
                  <option value="default">{t.proxies.sortDefault}</option>
                  <option value="name">{t.proxies.sortName}</option>
                  <option value="delay">{t.proxies.sortDelay}</option>
                  <option value="type">{t.proxies.sortType}</option>
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void patchProxiesUi({ sortAsc: !sortAsc })}
                >
                  {sortAsc ? t.proxies.sortAsc : t.proxies.sortDesc}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void patchProxiesUi({
                      density:
                        density === "compact" ? "comfortable" : "compact",
                    })
                  }
                >
                  {density === "compact"
                    ? t.proxies.densityCompact
                    : t.proxies.densityComfortable}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void testAll()}
                  disabled={testing || !group}
                >
                  <Timer className="size-3.5" strokeWidth={1.8} />
                  {testing ? t.proxies.testing : t.proxies.testGroup}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {tab === "providers" ? (
        <div className="flex min-h-0 flex-1 basis-0 flex-col gap-6 overflow-hidden">
          <Input
            className="max-w-72 shrink-0"
            placeholder={t.providers.filter}
            value={providerQuery}
            onChange={(e) => setProviderQuery(e.target.value)}
          />
          <Card className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden">
            <div
              className={cn(
                headClass,
                "grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_0.6fr_72px]",
              )}
            >
              <span>{t.providers.name}</span>
              <span>{t.providers.type}</span>
              <span>{t.providers.vehicle}</span>
              <span>{t.providers.updated}</span>
              <span>{t.providers.nodes}</span>
              <span />
            </div>
            <div className="relative min-h-0 flex-1">
              <ScrollArea className="absolute inset-0 h-full">
                {providerList.map((p) => {
                  const info = p.subscriptionInfo;
                  const used = (info?.upload ?? 0) + (info?.download ?? 0);
                  return (
                    <div
                      key={p.name}
                      className={cn(
                        rowClass,
                        "grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_0.6fr_72px]",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{p.name}</p>
                        {info?.total ? (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {formatBytes(used)} / {formatBytes(info.total)}
                          </p>
                        ) : null}
                      </div>
                      <span className="truncate text-muted-foreground">
                        {p.type}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {p.vehicleType}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {formatDate(p.updatedAt)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {p.proxies?.length ?? 0}
                      </span>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground"
                          disabled={providerBusy === p.name}
                          onClick={() => void refreshProvider(p.name)}
                        >
                          <RefreshCw className="size-3.5" strokeWidth={1.8} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground"
                          disabled={providerBusy === `h:${p.name}`}
                          onClick={() => void healthProvider(p.name)}
                        >
                          <Activity className="size-3.5" strokeWidth={1.8} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {!providerList.length ? (
                  <div className="flex min-h-32 items-center justify-center text-xs text-muted-foreground">
                    {t.providers.empty}
                  </div>
                ) : null}
              </ScrollArea>
            </div>
          </Card>
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 basis-0 grid-rows-1 gap-3 lg:grid-cols-[220px_1fr]">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
          <div className="relative min-h-0 flex-1">
            <ScrollArea className="absolute inset-0 h-full">
              <div className="space-y-0.5 p-2">
                {groups.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => setActiveGroup(g.name)}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary/55",
                      activeGroup === g.name && "bg-secondary/60",
                    )}
                  >
                    <span className="truncate text-xs">{g.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {g.type}
                      {g.now ? ` · ${g.now}` : ""}
                    </span>
                  </button>
                ))}
                {!groups.length ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    {t.proxies.noGroups}
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
            <Input
              className="max-w-64"
              placeholder={t.proxies.filter}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {group?.now ? (
              <Badge variant="secondary">
                {t.proxies.now} · {group.now}
              </Badge>
            ) : null}
          </div>
          <div
            className={cn(
              headClass,
              "grid grid-cols-[1fr_100px_80px]",
            )}
          >
            <span>{t.proxies.name}</span>
            <span>{t.proxies.type}</span>
            <span className="text-right">{t.proxies.delay}</span>
          </div>
          <div className="relative min-h-0 flex-1">
            <ScrollArea className="absolute inset-0 h-full">
              {members.map((node) => {
                const selected = group?.now === node.name;
                const delay =
                  delays[node.name] ??
                  node.history?.[node.history.length - 1]?.delay;
                return (
                  <button
                    key={node.name}
                    type="button"
                    onClick={() => void select(node.name)}
                    className={cn(
                      rowClass,
                      "grid grid-cols-[1fr_100px_80px]",
                      selected && "bg-secondary/60",
                    )}
                  >
                    <span className="truncate">{node.name}</span>
                    <span className="truncate text-muted-foreground">
                      {node.type}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {formatDelay(delay)}
                    </span>
                  </button>
                );
              })}
              {!members.length ? (
                <div className="flex min-h-32 items-center justify-center text-xs text-muted-foreground">
                  {t.proxies.noNodes}
                </div>
              ) : null}
            </ScrollArea>
          </div>
        </Card>
      </div>
      )}
    </ListPage>
  );
}
