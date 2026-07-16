import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  ClipboardPaste,
  Code2,
  Eye,
  FileCode2,
  FileUp,
  GripVertical,
  Layers,
  Network,
  Boxes,
  Link2,
  ListTree,
  Pencil,
  Plus,
  QrCode,
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
import {
  decodeQrFromFile,
  decodeQrFromVideo,
  extractSubscriptionUrl,
} from "@/shared/lib/qr";
import { useI18n } from "@/shared/i18n";
import { CodeEditor } from "@/shared/components/code-editor";
import yaml from "js-yaml";
import type { CustomProxyGroup, Profile } from "@/entities/mihomo/types";

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

  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesId, setRulesId] = useState<string | null>(null);
  const [rulesName, setRulesName] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [rulesBusy, setRulesBusy] = useState(false);
  const [appendText, setAppendText] = useState("");
  const [rulesTab, setRulesTab] = useState<"prepend" | "append">("prepend");

  const [proxiesOpen, setProxiesOpen] = useState(false);
  const [proxiesId, setProxiesId] = useState<string | null>(null);
  const [proxiesName, setProxiesName] = useState("");
  const [proxiesText, setProxiesText] = useState("[]");
  const [proxiesBusy, setProxiesBusy] = useState(false);

  const [providersOpen, setProvidersOpen] = useState(false);
  const [providersId, setProvidersId] = useState<string | null>(null);
  const [providersName, setProvidersName] = useState("");
  const [providersText, setProvidersText] = useState("{}");
  const [providersBusy, setProvidersBusy] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptProfile, setScriptProfile] = useState<Profile | null>(null);
  const [scriptId, setScriptId] = useState<string>("");
  const [scriptList, setScriptList] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [scriptBusy, setScriptBusy] = useState(false);

  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupsId, setGroupsId] = useState<string | null>(null);
  const [groupsName, setGroupsName] = useState("");
  const [groups, setGroups] = useState<CustomProxyGroup[]>([]);
  const [groupsBusy, setGroupsBusy] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

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

  async function importClipboard() {
    try {
      await getApi().importClipboard();
      await refreshProfiles();
      toast.success(t.profiles.clipboardImported);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function importQrFile(file: File) {
    try {
      const raw = await decodeQrFromFile(file);
      if (!raw) throw new Error(t.profiles.qrEmpty);
      const url = extractSubscriptionUrl(raw);
      if (!url) throw new Error(t.profiles.qrNoUrl);
      await getApi().addProfileUrl(url);
      await refreshProfiles();
      toast.success(t.profiles.qrImported);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function stopCamera() {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera() {
    setCameraBusy(true);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanTimerRef.current = window.setInterval(() => {
        void (async () => {
          if (!videoRef.current) return;
          const raw = decodeQrFromVideo(videoRef.current);
          if (!raw) return;
          const url = extractSubscriptionUrl(raw);
          if (!url) return;
          stopCamera();
          setCameraOpen(false);
          try {
            await getApi().addProfileUrl(url);
            await refreshProfiles();
            toast.success(t.profiles.qrImported);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        })();
      }, 450);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t.profiles.cameraDenied,
      );
      setCameraOpen(false);
    } finally {
      setCameraBusy(false);
    }
  }

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
      return;
    }
    void startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  async function openPreview(p: Profile) {
    try {
      const text = await getApi().getMergedPreview(p.id);
      setPreviewName(p.name);
      setPreviewText(text);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDropReorder(targetId: string) {
    if (!dragId || dragId === targetId || !profiles) return;
    const ids = profiles.items.map((x) => x.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    try {
      setProfiles(await getApi().reorderProfiles(ids));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDragId(null);
    }
  }

  function openRules(p: Profile) {
    setRulesId(p.id);
    setRulesName(p.name);
    setRulesText(
      (p.customRules?.length ? p.customRules : p.prependRules ?? []).join(
        "\n",
      ),
    );
    setAppendText((p.appendRules ?? []).join("\n"));
    setRulesTab("prepend");
    setRulesOpen(true);
  }

  async function saveRules() {
    if (!rulesId) return;
    setRulesBusy(true);
    try {
      const rules = rulesText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const append = appendText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      await getApi().setCustomRules(rulesId, rules);
      await getApi().setAppendRules(rulesId, append);
      await refreshProfiles();
      setRulesOpen(false);
      toast.success(t.profiles.overwriteSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRulesBusy(false);
    }
  }


  function openCustomProxies(p: Profile) {
    setProxiesId(p.id);
    setProxiesName(p.name);
    try {
      setProxiesText(
        p.customProxies?.length
          ? yaml.dump(p.customProxies, { lineWidth: -1 })
          : "[]",
      );
    } catch {
      setProxiesText("[]");
    }
    setProxiesOpen(true);
  }

  async function saveCustomProxies() {
    if (!proxiesId) return;
    setProxiesBusy(true);
    try {
      const parsed = yaml.load(proxiesText);
      if (!Array.isArray(parsed)) throw new Error("Expected a YAML/JSON array");
      await getApi().setCustomProxies(
        proxiesId,
        parsed as Array<Record<string, unknown>>,
      );
      await refreshProfiles();
      setProxiesOpen(false);
      toast.success(t.profiles.overwriteSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setProxiesBusy(false);
    }
  }

  function openCustomProviders(p: Profile) {
    setProvidersId(p.id);
    setProvidersName(p.name);
    try {
      setProvidersText(
        p.customProxyProviders && Object.keys(p.customProxyProviders).length
          ? yaml.dump(p.customProxyProviders, { lineWidth: -1 })
          : "{}",
      );
    } catch {
      setProvidersText("{}");
    }
    setProvidersOpen(true);
  }

  async function saveCustomProviders() {
    if (!providersId) return;
    setProvidersBusy(true);
    try {
      const parsed = yaml.load(providersText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected a YAML/JSON map");
      }
      await getApi().setCustomProxyProviders(
        providersId,
        parsed as Record<string, Record<string, unknown>>,
      );
      await refreshProfiles();
      setProvidersOpen(false);
      toast.success(t.profiles.overwriteSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setProvidersBusy(false);
    }
  }

  function openGroups(p: Profile) {
    setGroupsId(p.id);
    setGroupsName(p.name);
    setGroups(
      (p.customProxyGroups ?? []).map((g) => ({
        name: g.name,
        type: g.type,
        proxies: [...(g.proxies ?? [])],
        url: g.url,
        interval: g.interval,
        icon: g.icon,
        use: g.use ? [...g.use] : [],
      })),
    );
    setGroupsOpen(true);
  }

  function addEmptyGroup() {
    setGroups((gs) => [
      ...gs,
      { name: "", type: "select", proxies: ["DIRECT"] },
    ]);
  }

  async function saveGroups() {
    if (!groupsId) return;
    setGroupsBusy(true);
    try {
      const cleaned = groups
        .map((g) => ({
          name: g.name.trim(),
          type: g.type || "select",
          proxies: (g.proxies ?? [])
            .map((x) => x.trim())
            .filter(Boolean),
          url: g.url,
          interval: g.interval,
          icon: g.icon?.trim() || undefined,
          use: (g.use ?? []).map((x) => x.trim()).filter(Boolean),
        }))
        .filter((g) => g.name);
      await getApi().setCustomProxyGroups(groupsId, cleaned);
      await refreshProfiles();
      setGroupsOpen(false);
      toast.success(t.profiles.customGroupsSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGroupsBusy(false);
    }
  }

  async function openScript(p: Profile) {
    try {
      const list = await getApi().listScripts();
      setScriptList(list);
      setScriptProfile(p);
      setScriptId(p.scriptId || "");
      setScriptOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveScriptBinding() {
    if (!scriptProfile) return;
    setScriptBusy(true);
    try {
      await getApi().setProfileScript(
        scriptProfile.id,
        scriptId ? scriptId : null,
      );
      await refreshProfiles();
      setScriptOpen(false);
      toast.success(t.profiles.scriptSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setScriptBusy(false);
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
    <div className="space-y-6">
      <PageHeader
        title={t.profiles.title}
        description={t.profiles.desc}
        actions={
          <>
            <input
              ref={qrInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importQrFile(f);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => qrInputRef.current?.click()}
            >
              <QrCode className="size-3.5" strokeWidth={1.8} />
              {t.profiles.importQr}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="size-3.5" strokeWidth={1.8} />
              {t.profiles.importCamera}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void importClipboard()}
            >
              <ClipboardPaste className="size-3.5" strokeWidth={1.8} />
              {t.profiles.importClipboard}
            </Button>
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
              draggable
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void onDropReorder(p.id)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "flex flex-wrap items-center gap-3 p-4",
                active && "ring-1 ring-ring/30",
                dragId === p.id && "opacity-60",
              )}
            >
              <GripVertical
                className="size-4 shrink-0 cursor-grab text-muted-foreground"
                strokeWidth={1.8}
              />
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
                  {(p.customRules?.length || p.prependRules?.length) ? (
                    <Badge variant="secondary">
                      {t.profiles.overwriteRules} ·{" "}
                      {(p.customRules ?? p.prependRules)?.length}
                    </Badge>
                  ) : null}
                  {p.appendRules?.length ? (
                    <Badge variant="secondary">
                      {t.profiles.appendRules} · {p.appendRules.length}
                    </Badge>
                  ) : null}
                  {p.customProxyGroups?.length ? (
                    <Badge variant="secondary">
                      {t.profiles.customGroups} · {p.customProxyGroups.length}
                    </Badge>
                  ) : null}
                  {p.customProxies?.length ? (
                    <Badge variant="secondary">
                      {t.profiles.customProxies} · {p.customProxies.length}
                    </Badge>
                  ) : null}
                  {p.customProxyProviders &&
                  Object.keys(p.customProxyProviders).length ? (
                    <Badge variant="secondary">
                      {t.profiles.customProviders} ·{" "}
                      {Object.keys(p.customProxyProviders).length}
                    </Badge>
                  ) : null}
                  {p.scriptId ? (
                    <Badge variant="outline">{t.profiles.script}</Badge>
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
                  onClick={() => void openPreview(p)}
                  aria-label={t.profiles.preview}
                  title={t.profiles.preview}
                >
                  <Eye className="size-3.5" strokeWidth={1.8} />
                </Button>
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
                  onClick={() => openRules(p)}
                  aria-label={t.profiles.overwriteRules}
                  title={t.profiles.overwriteRules}
                >
                  <ListTree className="size-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => openGroups(p)}
                  aria-label={t.profiles.customGroups}
                  title={t.profiles.customGroups}
                >
                  <Layers className="size-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => openCustomProxies(p)}
                  aria-label={t.profiles.customProxies}
                  title={t.profiles.customProxies}
                >
                  <Network className="size-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => openCustomProviders(p)}
                  aria-label={t.profiles.customProviders}
                  title={t.profiles.customProviders}
                >
                  <Boxes className="size-3.5" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => void openScript(p)}
                  aria-label={t.profiles.script}
                  title={t.profiles.script}
                >
                  <Code2 className="size-3.5" strokeWidth={1.8} />
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

      {/* Merged runtime preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {t.profiles.preview}
              {previewName ? ` · ${previewName}` : ""}
            </DialogTitle>
            <DialogDescription>{t.profiles.previewDesc}</DialogDescription>
          </DialogHeader>
          <CodeEditor
            value={previewText}
            language="yaml"
            readOnly
            minHeight="360px"
          />
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void getApi().copyText(previewText);
                toast.success(t.settings.copied);
              }}
            >
              {t.settings.copy}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Script binding */}
      <Dialog
        open={scriptOpen}
        onOpenChange={(open) => {
          setScriptOpen(open);
          if (!open) setScriptProfile(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.profiles.script}
              {scriptProfile ? ` · ${scriptProfile.name}` : ""}
            </DialogTitle>
            <DialogDescription>{t.profiles.scriptHint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="profile-script">{t.profiles.script}</Label>
            <select
              id="profile-script"
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-secondary/55 px-3 text-xs focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">{t.profiles.scriptNone}</option>
              {scriptList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setScriptOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button
              size="sm"
              disabled={scriptBusy}
              onClick={() => void saveScriptBinding()}
            >
              {scriptBusy ? t.profiles.saving : t.profiles.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prepend rules overwrite */}
      <Dialog
        open={rulesOpen}
        onOpenChange={(open) => {
          setRulesOpen(open);
          if (!open) {
            setRulesId(null);
            setRulesText("");
          }
        }}
      >
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {t.profiles.overwriteRules}
              {rulesName ? ` · ${rulesName}` : ""}
            </DialogTitle>
            <DialogDescription>
              {t.profiles.overwriteRulesHint}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={rulesTab === "prepend" ? "default" : "secondary"}
              onClick={() => setRulesTab("prepend")}
            >
              {t.profiles.rulesTabPrepend}
            </Button>
            <Button
              size="sm"
              variant={rulesTab === "append" ? "default" : "secondary"}
              onClick={() => setRulesTab("append")}
            >
              {t.profiles.rulesTabAppend}
            </Button>
          </div>
          {rulesTab === "prepend" ? (
            <CodeEditor
              value={rulesText}
              onChange={setRulesText}
              language="text"
              minHeight="280px"
            />
          ) : (
            <CodeEditor
              value={appendText}
              onChange={setAppendText}
              language="text"
              minHeight="280px"
            />
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRulesOpen(false)}
            >
              {t.profiles.cancel}
            </Button>
            <Button
              size="sm"
              disabled={rulesBusy}
              onClick={() => void saveRules()}
            >
              {rulesBusy ? t.profiles.saving : t.profiles.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom proxy groups */}
      <Dialog
        open={groupsOpen}
        onOpenChange={(open) => {
          setGroupsOpen(open);
          if (!open) {
            setGroupsId(null);
            setGroups([]);
          }
        }}
      >
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {t.profiles.customGroups}
              {groupsName ? ` · ${groupsName}` : ""}
            </DialogTitle>
            <DialogDescription>
              {t.profiles.customGroupsHint}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(55vh,420px)] space-y-3 overflow-y-auto pr-1">
            {groups.map((g, i) => (
              <div
                key={i}
                className="space-y-2 rounded-md border border-border/60 bg-secondary/40 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t.profiles.groupName}</Label>
                    <Input
                      value={g.name}
                      onChange={(e) =>
                        setGroups((gs) =>
                          gs.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t.profiles.groupType}</Label>
                    <select
                      value={g.type}
                      onChange={(e) =>
                        setGroups((gs) =>
                          gs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  type: e.target
                                    .value as CustomProxyGroup["type"],
                                }
                              : x,
                          ),
                        )
                      }
                      className="flex h-8 w-full rounded-md border border-input bg-secondary/55 px-2 text-xs"
                    >
                      <option value="select">select</option>
                      <option value="url-test">url-test</option>
                      <option value="fallback">fallback</option>
                      <option value="load-balance">load-balance</option>
                    </select>
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setGroups((gs) => gs.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.8} />
                      {t.profiles.groupRemove}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">
                    {t.profiles.groupProxies}
                  </Label>
                  <Input
                    value={(g.proxies ?? []).join(", ")}
                    onChange={(e) =>
                      setGroups((gs) =>
                        gs.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                proxies: e.target.value
                                  .split(/[,，\n]+/)
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : x,
                        ),
                      )
                    }
                    className="h-8 font-mono text-xs"
                    placeholder="DIRECT, REJECT, node-a"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t.profiles.groupIcon}</Label>
                    <Input
                      value={g.icon ?? ""}
                      onChange={(e) =>
                        setGroups((gs) =>
                          gs.map((x, j) =>
                            j === i ? { ...x, icon: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-8 text-xs"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t.profiles.groupUse}</Label>
                    <Input
                      value={(g.use ?? []).join(", ")}
                      onChange={(e) =>
                        setGroups((gs) =>
                          gs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  use: e.target.value
                                    .split(/[,，\n]+/)
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                }
                              : x,
                          ),
                        )
                      }
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t.profiles.groupUrl}</Label>
                    <Input
                      value={g.url ?? ""}
                      onChange={(e) =>
                        setGroups((gs) =>
                          gs.map((x, j) =>
                            j === i ? { ...x, url: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t.profiles.groupInterval}</Label>
                    <Input
                      type="number"
                      value={g.interval ?? ""}
                      onChange={(e) =>
                        setGroups((gs) =>
                          gs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  interval: Number(e.target.value) || undefined,
                                }
                              : x,
                          ),
                        )
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
            {!groups.length ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                —
              </p>
            ) : null}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="secondary"
              size="sm"
              className="text-muted-foreground"
              onClick={addEmptyGroup}
            >
              <Plus className="size-3.5" strokeWidth={1.8} />
              {t.profiles.groupAdd}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setGroupsOpen(false)}
              >
                {t.profiles.cancel}
              </Button>
              <Button
                size="sm"
                disabled={groupsBusy}
                onClick={() => void saveGroups()}
              >
                {groupsBusy ? t.profiles.saving : t.profiles.save}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom proxies */}
      <Dialog
        open={proxiesOpen}
        onOpenChange={(open) => {
          setProxiesOpen(open);
          if (!open) setProxiesId(null);
        }}
      >
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {t.profiles.customProxies}
              {proxiesName ? ` · ${proxiesName}` : ""}
            </DialogTitle>
            <DialogDescription>
              {t.profiles.customProxiesHint}
            </DialogDescription>
          </DialogHeader>
          <CodeEditor
            value={proxiesText}
            onChange={setProxiesText}
            language="yaml"
            minHeight="320px"
          />
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setProxiesOpen(false)}>
              {t.profiles.cancel}
            </Button>
            <Button size="sm" disabled={proxiesBusy} onClick={() => void saveCustomProxies()}>
              {proxiesBusy ? t.profiles.saving : t.profiles.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom providers */}
      <Dialog
        open={providersOpen}
        onOpenChange={(open) => {
          setProvidersOpen(open);
          if (!open) setProvidersId(null);
        }}
      >
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {t.profiles.customProviders}
              {providersName ? ` · ${providersName}` : ""}
            </DialogTitle>
            <DialogDescription>
              {t.profiles.customProvidersHint}
            </DialogDescription>
          </DialogHeader>
          <CodeEditor
            value={providersText}
            onChange={setProvidersText}
            language="yaml"
            minHeight="320px"
          />
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setProvidersOpen(false)}>
              {t.profiles.cancel}
            </Button>
            <Button size="sm" disabled={providersBusy} onClick={() => void saveCustomProviders()}>
              {providersBusy ? t.profiles.saving : t.profiles.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera QR */}
      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) stopCamera();
        }}
      >
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t.profiles.cameraTitle}</DialogTitle>
            <DialogDescription>{t.profiles.cameraHint}</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-md border border-border/60 bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCameraOpen(false)}
            >
              {t.profiles.cameraStop}
            </Button>
            <Button
              size="sm"
              disabled={cameraBusy}
              onClick={() => void startCamera()}
            >
              {t.profiles.cameraStart}
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
          <CodeEditor
            value={yamlText}
            onChange={setYamlText}
            language="yaml"
            minHeight="360px"
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
