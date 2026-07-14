import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, RefreshCw } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import {
  ListPage,
  ListPanel,
  ListPanelPlaceholder,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
} from "@/shared/components/list-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { cn, formatBytes, formatDate } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { ProviderInfo } from "@/entities/mihomo/types";

export function ProvidersPage() {
  const core = useAppStore((s) => s.core);
  const { t } = useI18n();
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const running = core?.status === "running";

  const load = useCallback(async () => {
    if (!running) {
      setProviders({});
      return;
    }
    try {
      const res = await getApi().getProviders();
      setProviders(res.providers || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [running]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => {
    const items = Object.values(providers).filter(
      (p) => p.vehicleType !== "Compatible",
    );
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [providers, query]);

  async function refreshOne(name: string) {
    setBusy(name);
    try {
      await getApi().updateProvider(name);
      await load();
      toast.success(t.providers.refreshed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function healthOne(name: string) {
    setBusy(`h:${name}`);
    try {
      await getApi().healthcheckProvider(name);
      await load();
      toast.success(t.providers.healthDone);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!running) {
    return (
      <ListPage>
        <PageHeader title={t.providers.title} description={t.providers.desc} />
        <ListPanelPlaceholder>{t.providers.needCore}</ListPanelPlaceholder>
      </ListPage>
    );
  }

  return (
    <ListPage>
      <PageHeader
        title={t.providers.title}
        description={`${list.length} ${t.providers.count}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void load()}
          >
            <RefreshCw className="size-3.5" strokeWidth={1.8} />
            {t.providers.refresh}
          </Button>
        }
      />
      <Input
        className="max-w-72 shrink-0"
        placeholder={t.providers.filter}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ListPanel
        isEmpty={!list.length}
        empty={t.providers.empty}
        header={
          <div
            className={cn(
              TABLE_HEAD_CLASS,
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
        }
      >
        {list.map((p) => {
          const info = p.subscriptionInfo;
          const used = (info?.upload ?? 0) + (info?.download ?? 0);
          return (
            <div
              key={p.name}
              className={cn(
                TABLE_ROW_CLASS,
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
              <span className="truncate text-muted-foreground">{p.type}</span>
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
                  disabled={busy === p.name}
                  onClick={() => void refreshOne(p.name)}
                  aria-label={t.providers.refreshOne}
                >
                  <RefreshCw className="size-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  disabled={busy === `h:${p.name}`}
                  onClick={() => void healthOne(p.name)}
                  aria-label={t.providers.health}
                >
                  <Activity className="size-3.5" strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          );
        })}
      </ListPanel>
    </ListPage>
  );
}
