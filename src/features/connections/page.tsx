import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import {
  ListPage,
  ListPanel,
  ListPanelPlaceholder,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
} from "@/shared/components/list-panel";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { formatBytes } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { ConnectionsSnapshot } from "@/entities/mihomo/types";

export function ConnectionsPage() {
  const core = useAppStore((s) => s.core);
  const { t } = useI18n();
  const [data, setData] = useState<ConnectionsSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const running = core?.status === "running";

  const load = useCallback(async () => {
    if (!running) {
      setData(null);
      return;
    }
    try {
      setData(await getApi().getConnections());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [running]);

  useEffect(() => {
    void load();
    if (!running) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [load, running]);

  const rows = useMemo(() => {
    const list = data?.connections ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const host = c.metadata.host || c.metadata.destinationIP || "";
      const process = c.metadata.process || "";
      const chain = c.chains?.join(" ") || "";
      return (
        host.toLowerCase().includes(q) ||
        process.toLowerCase().includes(q) ||
        chain.toLowerCase().includes(q) ||
        c.rule.toLowerCase().includes(q)
      );
    });
  }, [data, query]);

  async function closeOne(id: string) {
    try {
      await getApi().closeConnection(id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function closeAll() {
    try {
      await getApi().closeAllConnections();
      await load();
      toast.success(t.connections.closedAll);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!running) {
    return (
      <ListPage>
        <PageHeader
          title={t.connections.title}
          description={t.connections.desc}
        />
        <ListPanelPlaceholder>{t.connections.needCore}</ListPanelPlaceholder>
      </ListPage>
    );
  }

  return (
    <ListPage>
      <PageHeader
        title={t.connections.title}
        description={`${rows.length} ${t.connections.active} · ${t.connections.up} ${formatBytes(data?.uploadTotal ?? 0)} · ${t.connections.down} ${formatBytes(data?.downloadTotal ?? 0)}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void load()}
            >
              <RefreshCw className="size-3.5" strokeWidth={1.8} />
              {t.connections.refresh}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void closeAll()}
            >
              {t.connections.closeAll}
            </Button>
          </>
        }
      />

      <Input
        className="max-w-72 shrink-0"
        placeholder={t.connections.filter}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ListPanel
        isEmpty={!rows.length}
        empty={t.connections.empty}
        header={
          <div
            className={cn(
              TABLE_HEAD_CLASS,
              "grid grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_0.5fr_28px]",
            )}
          >
            <span>{t.connections.host}</span>
            <span>{t.connections.process}</span>
            <span>{t.connections.chain}</span>
            <span>{t.connections.rule}</span>
            <span className="text-right">{t.connections.traffic}</span>
            <span />
          </div>
        }
      >
        {rows.map((c) => {
          const host =
            c.metadata.host ||
            `${c.metadata.destinationIP ?? ""}:${c.metadata.destinationPort ?? ""}`;
          return (
            <div
              key={c.id}
              className={cn(
                TABLE_ROW_CLASS,
                "grid grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_0.5fr_28px] hover:bg-secondary/40",
              )}
            >
              <span className="truncate" title={host}>
                {host || "—"}
              </span>
              <span className="truncate text-muted-foreground">
                {c.metadata.process || c.metadata.type || "—"}
              </span>
              <span className="truncate text-muted-foreground">
                {[...(c.chains || [])].reverse().join(" → ") || "—"}
              </span>
              <span className="truncate text-muted-foreground">
                {c.rule}
                {c.rulePayload ? `(${c.rulePayload})` : ""}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {formatBytes(c.download + c.upload)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground"
                onClick={() => void closeOne(c.id)}
                aria-label="Close"
              >
                <X className="size-3.5" strokeWidth={1.8} />
              </Button>
            </div>
          );
        })}
      </ListPanel>
    </ListPage>
  );
}
