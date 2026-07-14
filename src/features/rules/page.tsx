import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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
import { useI18n } from "@/shared/i18n";
import type { RuleItem } from "@/entities/mihomo/types";

export function RulesPage() {
  const core = useAppStore((s) => s.core);
  const { t } = useI18n();
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [query, setQuery] = useState("");
  const running = core?.status === "running";

  const load = useCallback(async () => {
    if (!running) {
      setRules([]);
      return;
    }
    try {
      const res = await getApi().getRules();
      setRules(res.rules || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [running]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.type.toLowerCase().includes(q) ||
        r.payload.toLowerCase().includes(q) ||
        r.proxy.toLowerCase().includes(q),
    );
  }, [rules, query]);

  if (!running) {
    return (
      <ListPage>
        <PageHeader title={t.rules.title} description={t.rules.desc} />
        <ListPanelPlaceholder>{t.rules.needCore}</ListPanelPlaceholder>
      </ListPage>
    );
  }

  return (
    <ListPage>
      <PageHeader
        title={t.rules.title}
        description={`${filtered.length} / ${rules.length} ${t.rules.rules}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void load()}
          >
            <RefreshCw className="size-3.5" strokeWidth={1.8} />
            {t.rules.refresh}
          </Button>
        }
      />
      <Input
        className="max-w-72 shrink-0"
        placeholder={t.rules.filter}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ListPanel
        isEmpty={!filtered.length}
        empty={t.rules.empty}
        header={
          <div
            className={cn(
              TABLE_HEAD_CLASS,
              "grid grid-cols-[120px_1fr_160px]",
            )}
          >
            <span>{t.rules.type}</span>
            <span>{t.rules.payload}</span>
            <span>{t.rules.proxy}</span>
          </div>
        }
      >
        {filtered.map((r, i) => (
          <div
            key={`${r.type}-${r.payload}-${i}`}
            className={cn(
              TABLE_ROW_CLASS,
              "grid grid-cols-[120px_1fr_160px]",
            )}
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              {r.type}
            </span>
            <span className="truncate">{r.payload || "—"}</span>
            <span className="truncate text-muted-foreground">{r.proxy}</span>
          </div>
        ))}
      </ListPanel>
    </ListPage>
  );
}
