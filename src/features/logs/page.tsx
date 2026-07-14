import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import { ListPage, ListPanel } from "@/shared/components/list-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { cn } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";

export function LogsPage() {
  const logs = useAppStore((s) => s.logs);
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.payload.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q),
    );
  }, [logs, query]);

  return (
    <ListPage>
      <PageHeader
        title={t.logs.title}
        description={t.logs.desc}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="text-muted-foreground"
            onClick={() => useAppStore.setState({ logs: [] })}
          >
            <Trash2 className="size-3.5" strokeWidth={1.8} />
            {t.logs.clear}
          </Button>
        }
      />
      <Input
        className="max-w-72 shrink-0"
        placeholder={t.logs.filter}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ListPanel isEmpty={!filtered.length} empty={t.logs.empty}>
        <div className="space-y-0 p-2 font-mono text-[11px] leading-5">
          {filtered.map((line, i) => (
            <div
              key={`${i}-${line.payload.slice(0, 24)}`}
              className="flex gap-2 rounded-sm px-2 py-0.5 hover:bg-secondary/40"
            >
              <Badge
                variant={
                  line.type === "error" || line.type === "warning"
                    ? "destructive"
                    : "secondary"
                }
                className="mt-0.5 h-4 shrink-0"
              >
                {line.type}
              </Badge>
              <pre
                className={cn(
                  "m-0 whitespace-pre-wrap break-all text-foreground/90",
                  (line.type === "error" || line.type === "warning") &&
                    "text-destructive",
                )}
              >
                {line.payload}
              </pre>
            </div>
          ))}
        </div>
      </ListPanel>
    </ListPage>
  );
}
