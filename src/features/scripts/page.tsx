import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileCode2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApi } from "@/shared/lib/api";
import { formatDate } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

type ScriptItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export function ScriptsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ScriptItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("Script");

  const load = useCallback(async () => {
    const list = await getApi().listScripts();
    setItems(list);
    if (activeId && !list.some((s) => s.id === activeId)) {
      setActiveId(list[0]?.id ?? null);
    } else if (!activeId && list[0]) {
      setActiveId(list[0].id);
    }
  }, [activeId]);

  useEffect(() => {
    void load().catch((e) =>
      toast.error(e instanceof Error ? e.message : String(e)),
    );
  }, [load]);

  useEffect(() => {
    if (!activeId) {
      setContent("");
      setName("");
      return;
    }
    void (async () => {
      try {
        const [text, list] = await Promise.all([
          getApi().getScriptContent(activeId),
          getApi().listScripts(),
        ]);
        setContent(text);
        setName(list.find((s) => s.id === activeId)?.name ?? "");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [activeId]);

  async function create() {
    setBusy(true);
    try {
      const s = await getApi().createScript(newName.trim() || "Script");
      await load();
      setActiveId(s.id);
      setCreateOpen(false);
      setNewName("Script");
      toast.success(t.scripts.created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!activeId) return;
    setBusy(true);
    try {
      if (name.trim()) await getApi().renameScript(activeId, name.trim());
      await getApi().saveScriptContent(activeId, content);
      await load();
      toast.success(t.scripts.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t.scripts.confirmDelete)) return;
    try {
      await getApi().deleteScript(id);
      if (activeId === id) setActiveId(null);
      await load();
      toast.success(t.scripts.deleted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 basis-0 flex-col gap-6 overflow-hidden">
      <PageHeader
        title={t.scripts.title}
        description={t.scripts.desc}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" strokeWidth={1.8} />
              {t.scripts.create}
            </Button>
            <Button size="sm" disabled={!activeId || busy} onClick={() => void save()}>
              {busy ? t.scripts.saving : t.scripts.save}
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 basis-0 grid-rows-1 gap-3 lg:grid-cols-[240px_1fr]">
        <Card className="flex min-h-0 flex-col overflow-hidden p-2">
          <div className="space-y-0.5 overflow-y-auto">
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary/55",
                  activeId === s.id && "bg-secondary/60",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatDate(s.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(s.id);
                  }}
                  aria-label={t.scripts.delete}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                </Button>
              </button>
            ))}
            {!items.length ? (
              <p className="p-3 text-xs text-muted-foreground">
                {t.scripts.empty}
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden p-4">
          {activeId ? (
            <>
              <div className="mb-3 flex shrink-0 items-center gap-2">
                <FileCode2 className="size-4 text-muted-foreground" strokeWidth={1.8} />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <p className="mb-2 shrink-0 text-[11px] text-muted-foreground">
                {t.scripts.hint}
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className="min-h-0 w-full flex-1 resize-none rounded-md border border-input bg-secondary/55 p-3 font-mono text-[11px] leading-5 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              {t.scripts.pickOrCreate}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.scripts.create}</DialogTitle>
            <DialogDescription>{t.scripts.createDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="script-name">{t.scripts.name}</Label>
            <Input
              id="script-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void create()}>
              {t.scripts.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
