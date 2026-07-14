import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { formatBytes, formatDate } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { GeoResourceFile } from "@/entities/mihomo/types";

export function ResourcesPage() {
  const core = useAppStore((s) => s.core);
  const { t } = useI18n();
  const [files, setFiles] = useState<GeoResourceFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFiles(await getApi().listGeo());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadOne(name: string) {
    setBusy(name);
    try {
      await getApi().downloadGeo(name);
      await load();
      toast.success(t.resources.downloaded);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    setBusy("all");
    try {
      await getApi().downloadAllGeo();
      await load();
      toast.success(t.resources.downloadedAll);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function upgradeViaCore() {
    if (core?.status !== "running") {
      toast.error(t.resources.needCore);
      return;
    }
    setBusy("core");
    try {
      await getApi().upgradeGeo();
      await load();
      toast.success(t.resources.upgraded);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function flushCaches() {
    if (core?.status !== "running") {
      toast.error(t.resources.needCore);
      return;
    }
    try {
      await getApi().flushFakeIp();
      await getApi().flushDns();
      toast.success(t.resources.flushed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.resources.title}
        description={t.resources.desc}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void flushCaches()}
            >
              {t.resources.flushCache}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              disabled={busy === "core"}
              onClick={() => void upgradeViaCore()}
            >
              {t.resources.upgradeCore}
            </Button>
            <Button
              size="sm"
              disabled={busy === "all"}
              onClick={() => void downloadAll()}
            >
              <Download className="size-3.5" strokeWidth={1.8} />
              {t.resources.downloadAll}
            </Button>
          </>
        }
      />

      <div className="grid gap-2">
        {files.map((f) => (
          <Card
            key={f.name}
            className="flex flex-wrap items-center gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{f.name}</p>
                <Badge variant={f.exists ? "success" : "secondary"}>
                  {f.exists ? t.resources.present : t.resources.missing}
                </Badge>
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {f.path}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {f.exists
                  ? `${formatBytes(f.size)} · ${formatDate(f.mtime)}`
                  : t.resources.notDownloaded}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              disabled={busy === f.name}
              onClick={() => void downloadOne(f.name)}
            >
              <RefreshCw className="size-3.5" strokeWidth={1.8} />
              {t.resources.download}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
