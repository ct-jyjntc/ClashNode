import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import {
  ListPage,
  ListPanel,
  ListPanelPlaceholder,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
} from "@/shared/components/list-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { cn, formatBytes, formatDate } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { RequestItem } from "@/entities/mihomo/types";

export function RequestsPage() {
  const core = useAppStore((s) => s.core);
  const { t } = useI18n();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [query, setQuery] = useState("");
  const running = core?.status === "running";

  useEffect(() => {
    if (!running) {
      setItems([]);
      return;
    }
    void (async () => {
      try {
        setItems(await getApi().getRequests());
      } catch {
        /* ignore */
      }
    })();
    const off = getApi().onRequestItem((item) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === item.id)) return prev;
        return [item, ...prev].slice(0, 500);
      });
    });
    return () => {
      off();
    };
  }, [running]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.host.toLowerCase().includes(q) ||
        (i.process || "").toLowerCase().includes(q) ||
        i.rule.toLowerCase().includes(q) ||
        i.chains.join(" ").toLowerCase().includes(q),
    );
  }, [items, query]);

  async function clear() {
    try {
      await getApi().clearRequests();
      setItems([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!running) {
    return (
      <ListPage>
        <PageHeader title={t.requests.title} description={t.requests.desc} />
        <ListPanelPlaceholder>{t.requests.needCore}</ListPanelPlaceholder>
      </ListPage>
    );
  }

  return (
    <ListPage>
      <PageHeader
        title={t.requests.title}
        description={`${filtered.length} ${t.requests.count}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void clear()}
          >
            <Trash2 className="size-3.5" strokeWidth={1.8} />
            {t.requests.clear}
          </Button>
        }
      />
      <Input
        className="max-w-72 shrink-0"
        placeholder={t.requests.filter}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ListPanel
        isEmpty={!filtered.length}
        empty={t.requests.empty}
        header={
          <div
            className={cn(
              TABLE_HEAD_CLASS,
              "grid grid-cols-[1.2fr_0.7fr_0.8fr_0.9fr_0.5fr]",
            )}
          >
            <span>{t.requests.host}</span>
            <span>{t.requests.process}</span>
            <span>{t.requests.rule}</span>
            <span>{t.requests.chain}</span>
            <span className="text-right">{t.requests.traffic}</span>
          </div>
        }
      >
        {filtered.map((r) => (
          <div
            key={r.id}
            className={cn(
              TABLE_ROW_CLASS,
              "grid grid-cols-[1.2fr_0.7fr_0.8fr_0.9fr_0.5fr]",
            )}
            title={formatDate(r.time)}
          >
            <span className="truncate">{r.host || "—"}</span>
            <span className="truncate text-muted-foreground">
              {r.process || r.type || "—"}
            </span>
            <span className="truncate text-muted-foreground">
              {r.rule}
              {r.rulePayload ? `(${r.rulePayload})` : ""}
            </span>
            <span className="truncate text-muted-foreground">
              {[...(r.chains || [])].reverse().join(" → ") || "—"}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {formatBytes(r.download + r.upload)}
            </span>
          </div>
        ))}
      </ListPanel>
    </ListPage>
  );
}
