import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Timer } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import {
  ListPage,
  ListPanelPlaceholder,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
} from "@/shared/components/list-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { cn, formatDelay } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { ProxyNode } from "@/entities/mihomo/types";

const GROUP_TYPES = new Set([
  "Selector",
  "URLTest",
  "Fallback",
  "LoadBalance",
  "Relay",
]);

export function ProxiesPage() {
  const core = useAppStore((s) => s.core);
  const { t } = useI18n();
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({});
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [query, setQuery] = useState("");
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const running = core?.status === "running";

  const load = useCallback(async () => {
    if (!running) {
      setProxies({});
      return;
    }
    setLoading(true);
    try {
      const res = await getApi().getProxies();
      setProxies(res.proxies || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [running]);

  useEffect(() => {
    void load();
  }, [load]);

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
    return group.all
      .map((name) => proxies[name] || { name, type: "Unknown" })
      .filter((n) => !q || n.name.toLowerCase().includes(q));
  }, [group, proxies, query]);

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

  return (
    <ListPage>
      <PageHeader
        title={t.proxies.title}
        description={`${groups.length} ${t.proxies.groups}`}
        actions={
          <>
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
            <Button
              size="sm"
              onClick={() => void testAll()}
              disabled={testing || !group}
            >
              <Timer className="size-3.5" strokeWidth={1.8} />
              {testing ? t.proxies.testing : t.proxies.testGroup}
            </Button>
          </>
        }
      />

      {/*
        flex-1 basis-0 + grid-rows-1 so both columns stretch to the full
        remaining page height (not content height).
      */}
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
              TABLE_HEAD_CLASS,
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
                      TABLE_ROW_CLASS,
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
    </ListPage>
  );
}
