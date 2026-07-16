import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/shared/components/page-header";
import {
  ListPage,
  ListPanel,
} from "@/shared/components/list-panel";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { useI18n } from "@/shared/i18n";
import type { LogLine } from "@/entities/mihomo/types";

const HEAD_ROW =
  "grid h-9 w-full min-w-0 shrink-0 grid-cols-[7.5rem_4.5rem_minmax(0,1fr)] items-center gap-2 border-b border-border/60 px-3 text-xs font-normal text-muted-foreground";
const BODY_ROW =
  "grid h-9 w-full min-w-0 grid-cols-[7.5rem_4.5rem_minmax(0,1fr)] items-center gap-2 border-b border-border/40 px-3 text-left text-xs transition-colors hover:bg-secondary/40";

/** Parse mihomo structured log: time="..." level=info msg="..." */
function normalizeLog(line: LogLine): { time: string; type: string; message: string } {
  const raw = (line.payload ?? "").replace(/\r/g, "").trim();
  let time = line.time?.trim() || "";
  let type = (line.type || "info").toLowerCase();
  let message = raw;

  const timeMatch = raw.match(/\btime="([^"]+)"/);
  if (timeMatch) {
    time = time || timeMatch[1];
  }

  const levelMatch = raw.match(/\blevel=(\w+)/i);
  if (levelMatch) {
    type = levelMatch[1].toLowerCase();
  }

  const msgMatch = raw.match(/\bmsg="((?:\\.|[^"\\])*)"/);
  if (msgMatch) {
    message = msgMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
  } else if (timeMatch || levelMatch) {
    // strip structured fields, keep remainder
    message = raw
      .replace(/\btime="[^"]*"\s*/g, "")
      .replace(/\blevel=\w+\s*/gi, "")
      .replace(/\bmsg=/gi, "")
      .trim();
  }

  return {
    time: formatLogTime(time),
    type,
    message: message || raw || "—",
  };
}

function formatLogTime(value: string): string {
  if (!value) return "—";
  // ISO-ish: 2026-07-17T00:01:22.873477000+08:00
  const iso = value.replace(
    /\.(\d{3})\d*(?=[Z+\-]|$)/,
    ".$1",
  );
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  // already short?
  if (/^\d{1,2}:\d{2}/.test(value)) return value.slice(0, 8);
  return value.length > 12 ? value.slice(11, 19) || value.slice(0, 8) : value;
}

export function LogsPage() {
  const { t } = useI18n();
  const logs = useAppStore((s) => s.logs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    return logs.map((line, index) => {
      const n = normalizeLog(line);
      return { ...n, index, raw: line };
    });
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (l) =>
        l.message.toLowerCase().includes(needle) ||
        l.type.toLowerCase().includes(needle) ||
        l.time.toLowerCase().includes(needle) ||
        (l.raw.payload ?? "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  async function exportLogs() {
    setExporting(true);
    try {
      const content = filtered
        .map((l) => `${l.time}\t${l.type}\t${l.message}`)
        .join("\n");
      const path = await getApi().saveText(
        content,
        `clashnode-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`,
      );
      if (path) toast.success(`${t.logs.exported}: ${path}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <ListPage className="min-w-0 overflow-hidden">
      <PageHeader
        title={t.logs.title}
        description={t.logs.description}
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!filtered.length || exporting}
              onClick={() => void exportLogs()}
            >
              <Download className="mr-1 size-3.5" />
              {t.logs.export}
            </Button>
            <Button size="sm" variant="outline" onClick={() => clearLogs()}>
              <Trash2 className="mr-1 size-3.5" />
              {t.common.clear}
            </Button>
          </div>
        }
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.logs.filter}
        className="h-8 max-w-sm shrink-0 text-xs"
      />
      <ListPanel
        className="min-w-0 overflow-hidden"
        isEmpty={!filtered.length}
        empty={t.logs.empty}
        header={
          <div className={HEAD_ROW}>
            <span className="truncate">{t.logs.time}</span>
            <span className="truncate">{t.logs.level}</span>
            <span className="min-w-0 truncate">{t.logs.message}</span>
          </div>
        }
      >
        <div className="min-w-0 font-mono">
          {filtered.map((line) => (
            <div
              key={`${line.index}-${line.time}-${line.message.slice(0, 24)}`}
              className={BODY_ROW}
            >
              <span className="truncate tabular-nums text-muted-foreground">
                {line.time}
              </span>
              <Badge
                variant="secondary"
                className="w-full max-w-[4.5rem] justify-center truncate px-1"
              >
                {line.type}
              </Badge>
              <span className="min-w-0 truncate" title={line.message}>
                {line.message}
              </span>
            </div>
          ))}
        </div>
      </ListPanel>
    </ListPage>
  );
}
