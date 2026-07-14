import { useState } from "react";
import { toast } from "sonner";
import {
  FileCode2,
  FileUp,
  Link2,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/shared/hooks/use-app-state";
import { getApi } from "@/shared/lib/api";
import { cn, formatBytes, formatDate } from "@/shared/lib/utils";
import { useI18n } from "@/shared/i18n";
import type { Profile } from "@/entities/mihomo/types";

export function ProfilesPage() {
  const profiles = useAppStore((s) => s.profiles);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const { t } = useI18n();

  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editAutoUpdate, setEditAutoUpdate] = useState(true);
  const [editBusy, setEditBusy] = useState(false);

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlId, setYamlId] = useState<string | null>(null);
  const [yamlName, setYamlName] = useState("");
  const [yamlText, setYamlText] = useState("");
  const [yamlBusy, setYamlBusy] = useState(false);

  async function addUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await getApi().addProfileUrl(url.trim(), name.trim() || undefined);
      await refreshProfiles();
      setAddOpen(false);
      setUrl("");
      setName("");
      toast.success(t.profiles.imported);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addFile() {
    try {
      const p = await getApi().addProfileFile();
      if (!p) return;
      await refreshProfiles();
      toast.success(t.profiles.fileAdded);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function select(id: string) {
    try {
      setProfiles(await getApi().setCurrentProfile(id));
      toast.success(t.profiles.activated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function refresh(id: string) {
    try {
      await getApi().updateProfile(id);
      await refreshProfiles();
      try {
        await getApi().reloadConfig();
      } catch {
        /* ignore when stopped */
      }
      toast.success(t.profiles.profileUpdated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t.profiles.confirmDelete)) return;
    try {
      setProfiles(await getApi().deleteProfile(id));
      toast.success(t.profiles.profileDeleted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function openEdit(p: Profile) {
    setEditing(p);
    setEditName(p.name);
    setEditUrl(p.url ?? "");
    setEditAutoUpdate(p.autoUpdate);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim()) return;
    setEditBusy(true);
    try {
      const patch: { name?: string; url?: string; autoUpdate?: boolean } = {
        name: editName.trim(),
        autoUpdate: editAutoUpdate,
      };
      if (editing.type === "url" || editUrl.trim()) {
        patch.url = editUrl.trim();
      }
      await getApi().editProfile(editing.id, patch);
      await refreshProfiles();
      setEditOpen(false);
      setEditing(null);
      toast.success(t.profiles.profileSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  }

  async function openYaml(p: Profile) {
    try {
      const content = await getApi().getProfileContent(p.id);
      setYamlId(p.id);
      setYamlName(p.name);
      setYamlText(content ?? "");
      setYamlOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveYaml() {
    if (!yamlId) return;
    setYamlBusy(true);
    try {
      await getApi().saveProfileContent(yamlId, yamlText);
      await refreshProfiles();
      setYamlOpen(false);
      setYamlId(null);
      toast.success(t.profiles.yamlSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setYamlBusy(false);
    }
  }

  const items = profiles?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.profiles.title}
        description={t.profiles.desc}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void addFile()}
            >
              <FileUp className="size-3.5" strokeWidth={1.8} />
              {t.profiles.importFile}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Link2 className="size-3.5" strokeWidth={1.8} />
              {t.profiles.addUrl}
            </Button>
          </>
        }
      />

      <div className="grid gap-2">
        {items.map((p) => {
          const active = profiles?.currentId === p.id;
          const used =
            (p.subscriptionInfo?.upload ?? 0) +
            (p.subscriptionInfo?.download ?? 0);
          const total = p.subscriptionInfo?.total;
          return (
            <Card
              key={p.id}
              className={cn(
                "flex flex-wrap items-center gap-3 p-4",
                active && "ring-1 ring-ring/30",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  {active ? (
                    <Badge variant="success">{t.profiles.active}</Badge>
                  ) : null}
                  <Badge variant="secondary">{p.type}</Badge>
                  {p.type === "url" && p.autoUpdate ? (
                    <Badge variant="outline">{t.profiles.autoUpdate}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {p.url || p.filePath || p.id}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.profiles.updated} {formatDate(p.lastUpdated)}
                  {total
                    ? ` · ${formatBytes(used)} / ${formatBytes(total)}`
                    : used
                      ? ` · ${formatBytes(used)} ${t.profiles.used}`
                      : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!active ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => void select(p.id)}
                  >
                    <Star className="size-3.5" strokeWidth={1.8} />
                    {t.profiles.use}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => openEdit(p)}
                  aria-label={t.profiles.edit}
                  title={t.profiles.edit}
                >
                  <Pencil className="size-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => void openYaml(p)}
                  aria-label={t.profiles.editYaml}
                  title={t.profiles.editYaml}
                >
                  <FileCode2 className="size-3.5" strokeWidth={1.8} />
                </Button>
                {p.type === "url" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    onClick={() => void refresh(p.id)}
                    aria-label={t.profiles.update}
                    title={t.profiles.update}
                  >
                    <RefreshCw className="size-3.5" strokeWidth={1.8} />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => void remove(p.id)}
                  aria-label={t.profiles.delete}
                  title={t.profiles.delete}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.8} />
                </Button>
              </div>
            </Card>
          );
        })}
        {!items.length ? (
          <Card className="flex min-h-40 items-center justify-center p-6 text-xs text-muted-foreground">
            {t.profiles.empty}
          </Card>
        ) : null}
      </div>

      {/* Add subscription */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.profiles.dialogTitle}</DialogTitle>
            <DialogDescription>{t.profiles.dialogDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">{t.profiles.url}</Label>
              <Input
                id="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t.profiles.nameOptional}</Label>
              <Input
                id="name"
                placeholder="My provider"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button
              size="sm"
              disabled={busy || !url.trim()}
              onClick={() => void addUrl()}
            >
              {busy ? t.profiles.importing : t.profiles.import}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit metadata */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.profiles.editTitle}</DialogTitle>
            <DialogDescription>{t.profiles.editDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t.profiles.name}</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">{t.profiles.url}</Label>
              <Input
                id="edit-url"
                placeholder="https://…"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {editing?.type === "file"
                  ? editing.filePath
                  : null}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/55 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs text-foreground">
                  {t.profiles.autoUpdate}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t.profiles.autoUpdateHint}
                </p>
              </div>
              <Switch
                checked={editAutoUpdate}
                onCheckedChange={setEditAutoUpdate}
                disabled={!editUrl.trim() && editing?.type !== "url"}
                aria-label={t.profiles.autoUpdate}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button
              size="sm"
              disabled={editBusy || !editName.trim()}
              onClick={() => void saveEdit()}
            >
              {editBusy ? t.profiles.saving : t.profiles.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit YAML */}
      <Dialog
        open={yamlOpen}
        onOpenChange={(open) => {
          setYamlOpen(open);
          if (!open) {
            setYamlId(null);
            setYamlText("");
          }
        }}
      >
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {t.profiles.yamlTitle}
              {yamlName ? ` · ${yamlName}` : ""}
            </DialogTitle>
            <DialogDescription>{t.profiles.yamlDesc}</DialogDescription>
          </DialogHeader>
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            spellCheck={false}
            className="h-[min(60vh,480px)] w-full resize-y rounded-md border border-input bg-secondary/55 p-3 font-mono text-[11px] leading-5 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setYamlOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button
              size="sm"
              disabled={yamlBusy || !yamlText.trim()}
              onClick={() => void saveYaml()}
            >
              {yamlBusy ? t.profiles.saving : t.profiles.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
